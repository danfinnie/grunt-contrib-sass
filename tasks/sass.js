'use strict';

var path = require('path');
var dargs = require('dargs');
var async = require('async');
var chalk = require('chalk');
var spawn = require('win-spawn');
var which = require('which');
var checkFilesSyntax = require('./lib/check');

module.exports = function (grunt) {
  var bannerCallback = function (filename, banner) {
    grunt.verbose.writeln('Writing CSS banner for ' + filename);
    grunt.file.write(filename, banner + grunt.util.linefeed + grunt.file.read(filename));
  };

  var checkBinary = function (cmd, errMess) {
    try {
      which.sync(cmd);
    } catch (err) {
      return grunt.warn(
        '\n' + errMess + '\n' +
        'More info: https://github.com/gruntjs/grunt-contrib-sass\n'
      );
    }
  };

  var addFile = function (src, dest, cssFiles, sourceFiles) {
    var fileTuple = [src, dest];
    if (path.extname(src) === '.css') {
      cssFiles.push(fileTuple);
    } else {
      sourceFiles.push(fileTuple);
    }
  };

  grunt.registerMultiTask('sass', 'Compile Sass to CSS', function () {
    var cb = this.async();
    var options = this.options();
    var nonUpdatingCssFiles = [];
    var nonUpdatingSourceFiles = [];
    var updatingCssFiles = [];
    var updatingSourceFiles = [];
    var excludedArgs = ['bundleExec', 'banner', 'update', 'force', 'f'];
    var passedArgs = dargs(options, excludedArgs);
    var bin;
    var preArgs;


    if (options.bundleExec) {
      checkBinary('bundle',
        'bundleExec options set but no Bundler executable found in your PATH.'
      );
    } else {
      checkBinary('sass',
        'You need to have Ruby and Sass installed and in your PATH for this task to work.'
      );
    }

    if (options.check) {
      checkFilesSyntax(this.filesSrc, options, cb);
      return;
    }

    this.files.forEach(function(file) {
      var src = file.src[0];
      var dest = file.dest;

      if (typeof src !== 'string') {
        src = file.orig.src[0];
      }

      if (!grunt.file.exists(src)) {
        grunt.log.warn('Source file "' + src + '" not found.');
        return;
      }

      if (path.basename(src)[0] === '_') {
        return;
      }

      if (options.update && grunt.file.exists(dest)) {
        // when the source file hasn't yet been compiled sass will write an empty file.
        // if this is the first time the file has been written we treat it as if `update` was not passed
        addFile(src, dest, updatingCssFiles, updatingSourceFiles);
      } else {
        addFile(src, dest, nonUpdatingCssFiles, nonUpdatingSourceFiles);
      }

      // Make sure grunt creates the destination folders if they don't exist
      if (!grunt.file.exists(dest)) {
        grunt.file.write(dest, '');
      }
    });

    if (options.bundleExec) {
      bin = 'bundle';
      preArgs = ['exec', 'sass'];
    } else {
      bin = 'sass';
      preArgs = [];
    }

    // SASS automatically applies --update when you give it multiple files.
    if (!options.update) {
      preArgs.push("--force");
    }

    var yolocorn = function(bin, extraArgs, files, next) {
      var fileArgs = files.map(function(file) { return file.join(":"); });
      var args = extraArgs.concat(fileArgs);
      grunt.verbose.writeln('Command: ' + bin + ' ' + args.join(' '));
      var cp = spawn(bin, args, {stdio: 'inherit'});
      cp.on('error', grunt.warn);
      cp.on('close', function (code) {
        if (code > 0) {
          return grunt.warn('Exited with error code ' + code);
        }

        files.forEach(function(fileTuple) {
          var dest = fileTuple[1];

          // Callback to insert banner
          if (options.banner) {
            bannerCallback(dest, options.banner);
          }

          grunt.verbose.writeln('File ' + chalk.cyan(dest) + ' created.');
        });

        next();
      });
    };

    async.series(
      [
        function(next) {
          if (nonUpdatingSourceFiles.length > 0) {
            yolocorn(bin, preArgs.concat(passedArgs), nonUpdatingSourceFiles, next);
          } else {
            next();
          }
        },
        function(next) {
          if (updatingSourceFiles.length > 0) {
            yolocorn(bin, preArgs.concat(passedArgs).concat(['--update']), updatingSourceFiles, next);
          } else {
            next();
          }
        },
        function(next) {
          if (nonUpdatingCssFiles.length > 0) {
            yolocorn(bin, preArgs.concat(passedArgs).concat(['--scss']), nonUpdatingCssFiles, next);
          } else {
            next();
          }
        },
        function(next) {
          if (updatingCssFiles.length > 0) {
            yolocorn(bin, preArgs.concat(passedArgs).concat(['--update', '--scss']), updatingCssFiles, next);
          } else {
            next();
          }
        },
      ],
      function(err) {
        if(err) {
          grunt.warn(err);
        }

        cb();
      }
    );
  });
};
