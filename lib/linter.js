const path = require("path");
const webextLinter = require("addons-linter");
const unzip = require("unzip-crx");
const fs = require('fs-extra');

const COMPAT_DESCRIPTIONS = [
  'This API has been deprecated by Chrome and has not been implemented by Firefox.',
  'This API has not been implemented by Firefox.'
];

console.log('lint worker started');

process.on('message', (m) => {
  console.log('linting ' + m.packagePath);
  compatLint(m.packagePath, m.id);
});

function compatLint(packagePath, id) {

  let tempPath = path.join(".", ".temp", id);

  return fs.ensureDir(tempPath)
    .then(() => {
      console.log(`[${id}] unpacking extension...`);
      return unzip(packagePath, tempPath).catch(e => {throw "Failed to unpack file."});
    })
    .then(function() {
      console.log(`[${id}] linting....`);
      const linter = webextLinter.createInstance({
        config: {
          // This mimics the first command line argument from yargs,
          // which should be the directory to the extension.
          _: [packagePath],
          logLevel: process.env.VERBOSE ? "debug" : "fatal",
          stack: Boolean(process.env.VERBOSE),
          pretty: false,
          warningsAsErrors: false,
          metadata: false,
          output: "none",
          boring: false,
          selfHosted: false,
          langpack: false
        },
        runAsBinary: false
      });

      return linter.run();
    })
    .then((lint) => {
      const results = {
        compat: [],
        errors: [],
        notices: [],
        warnings: []
      }
      lint.warnings.forEach(w => {
        if (COMPAT_DESCRIPTIONS.includes(w.description)) {
          results.compat.push(w);
        } else if (w.code === 'MANIFEST_PERMISSIONS') {
          results.compat.push(w);
        } else {
          results.warnings.push(w);
        }
      });
      results.errors = lint.errors;
      results.notices = lint.notcies;

      fs.remove(tempPath);
      process.send({
        status: 'success',
        results: results
      });
      console.log(`[${id}] linting complete.`);
    })
    .catch(e => {
      console.log(`[${id}] linter error:`, e);
      fs.remove(tempPath);
      process.send({
        status: 'error',
        error: e
      });
    });
}
