(function() {
  var $root, Gistquire, Runtime, actions, branch, builder, classicError, confirmUnsaved, distribution, errors, files, filetree, fullName, hotReloadCSS, issues, notices, notify, owner, repo, repository, repositoryLoaded, _ref, _ref1,
    __slice = [].slice;

  _ref = ENV.root, files = _ref.source, distribution = _ref.distribution;

  window.ENV = ENV;

  Runtime = require("./source/runtime");

  Gistquire = require("./source/gistquire");

  classicError = function(request) {
    var message;
    notices([]);
    if (request.responseJSON) {
      message = JSON.stringify(request.responseJSON, null, 2);
    } else {
      message = "Error";
    }
    return errors([message]);
  };

  notify = function(message) {
    notices([message]);
    return errors([]);
  };

  $root = $(Runtime(ENV.root).boot());

  Gistquire.onload();

  _ref1 = ENV.repository, owner = _ref1.owner, repo = _ref1.repo, branch = _ref1.branch, fullName = _ref1.full_name;

  fullName || (fullName = "" + owner + "/" + repo);

  repository = Repository({
    url: "repos/" + fullName,
    branch: branch
  });

  errors = Observable([]);

  notices = Observable([]);

  builder = Builder();

  repositoryLoaded = function(repository) {
    issues.repository = repository;
    repository.pullRequests().then(issues.reset);
    return notify("Finished loading!");
  };

  confirmUnsaved = function() {
    return Deferred.ConfirmIf(filetree.hasUnsavedChanges(), "You will lose unsaved changes in your current branch, continue?");
  };

  issues = Issues();

  builder.addPostProcessor(function(data) {
    data.repository = {
      full_name: fullName,
      branch: repository.branch()
    };
    return data;
  });

  builder.addPostProcessor(function(data) {
    data.progenitor = {
      url: "http://strd6.github.io/editor/"
    };
    return data;
  });

  actions = {
    save: function() {
      notify("Saving...");
      return Actions.save({
        repository: repository,
        fileData: filetree.data(),
        builder: builder
      }).then(function() {
        filetree.markSaved();
        return notify("Saved and published!");
      }).fail(function() {
        var args;
        args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        return errors(args);
      });
    },
    run: function() {
      return Actions.run({
        builder: builder,
        filetree: filetree
      }).then(function() {
        return notify("Running!");
      }).fail(errors);
    },
    test: function() {
      notify("Running tests...");
      return builder.testScripts(filetree.data()).then(function(testScripts) {
        return TestRunner.launch(testScripts);
      }).fail(errors);
    },
    new_file: function() {
      var file, name;
      if (name = prompt("File Name", "newfile.coffee")) {
        file = File({
          filename: name,
          content: ""
        });
        filetree.files.push(file);
        return filetree.selectedFile(file);
      }
    },
    load_repo: function(skipPrompt) {
      return confirmUnsaved().then(function() {
        if (!skipPrompt) {
          fullName = prompt("Github repo", fullName);
        }
        if (fullName) {
          repository = Repository({
            url: "repos/" + fullName
          });
        } else {
          errors(["No repo given"]);
          return;
        }
        notify("Loading repo...");
        return Actions.load({
          repository: repository,
          filetree: filetree
        }).then(function() {
          var root;
          repositoryLoaded(repository);
          root = $root.children(".main");
          return root.find(".editor-wrap").remove();
        }).fail(function() {
          return errors(["Error loading " + (repository.url())]);
        });
      });
    },
    new_feature: function() {
      var title;
      if (title = prompt("Description")) {
        notify("Creating feature branch...");
        return repository.createPullRequest({
          title: title
        }).then(function(data) {
          var issue;
          issue = Issue(data);
          issues.issues.push(issue);
          issues.silent = true;
          issues.currentIssue(issue);
          issues.silent = false;
          errors([]);
          return notices.push("Created!");
        }, classicError);
      }
    },
    pull_master: function() {
      return confirmUnsaved().then(function() {
        notify("Merging in default branch...");
        return repository.pullFromBranch();
      }, classicError).then(function() {
        var branchName;
        notices.push("Merged!");
        branchName = repository.branch();
        notices.push("\nReloading branch " + branchName + "...");
        return Actions.load({
          repository: repository,
          filetree: filetree
        }).then(function() {
          return notices.push("Loaded!");
        }).fail(function() {
          return errors(["Error loading " + (repository.url())]);
        });
      });
    }
  };

  filetree = Filetree();

  filetree.load(files);

  filetree.selectedFile.observe(function(file) {
    var editor, root;
    root = $root.children(".main");
    root.find(".editor-wrap").hide();
    if (file.editor) {
      return file.editor.trigger("show");
    } else {
      root.append(HAMLjr.render("text_editor"));
      file.editor = root.find(".editor-wrap").last();
      editor = TextEditor({
        text: file.content(),
        el: file.editor.find('.editor').get(0),
        mode: file.mode()
      });
      file.editor.on("show", function() {
        file.editor.show();
        return editor.editor.focus();
      });
      return editor.text.observe(function(value) {
        file.content(value);
        if (file.path().match(/\.styl$/)) {
          return hotReloadCSS();
        }
      });
    }
  });

  hotReloadCSS = (function() {
    return builder.buildStyle(filetree.data()).then(Runner.hotReloadCSS);
  }).debounce(500);

  repositoryLoaded(repository);

  issues.currentIssue.observe(function(issue) {
    var changeBranch;
    if (issues.silent) {
      return;
    }
    changeBranch = function(branchName) {
      var previousBranch;
      previousBranch = repository.branch();
      return confirmUnsaved().then(function() {
        return repository.switchToBranch(branchName).then(function() {
          notices.push("\nLoading branch " + branchName + "...");
          return Actions.load({
            repository: repository,
            filetree: filetree
          }).then(function() {
            return notices.push("Loaded!");
          });
        });
      }, function() {
        repository.branch(previousBranch);
        return errors(["Error switching to " + branchName + ", still on " + previousBranch]);
      });
    };
    if (issue) {
      notify(issue.fullDescription());
      return changeBranch(issue.branchName());
    } else {
      notify("Default branch selected");
      return changeBranch(repository.defaultBranch());
    }
  });

  $root.append(HAMLjr.render("editor", {
    filetree: filetree,
    actions: actions,
    notices: notices,
    errors: errors,
    issues: issues
  }));

  Gistquire.api("rate_limit").then(function(data, status, request) {
    return $root.append(HAMLjr.render("github_status", {
      request: request
    }));
  });

  window.onbeforeunload = function() {
    if (filetree.hasUnsavedChanges()) {
      return "You have some unsaved changes, if you leave now you will lose your work.";
    }
  };

}).call(this);
