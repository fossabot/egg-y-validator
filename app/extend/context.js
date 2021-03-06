'use strict';
const Validate = require('async-validator');
const { resolve } = require('path');
const glob = require('globby');
const mi = require('m-import').default;
const R = require('ramda');
const camelCase = require('camelcase');

const CACHE = Symbol.for('egg-y-validator');

const { assocPath, compose, curry } = R;

const delStr = curry((delStr, souStr) => {
  if (Array.isArray(delStr)) {
    return delStr.reduce((prev, current) => prev.replace(current, ''), souStr);
  }
  return souStr.replace(delStr, '');
});

module.exports = {
  loadDocs(reload) {
    if (!reload && this[CACHE]) {
      return this[CACHE];
    }
    const { app } = this;
    let schemas = {};

    const matchPath = resolve(app.config.baseDir, 'app', 'schemas');
    const paths = glob.sync(matchPath + '/**/*');

    const delAllStr = compose(
      delStr([
        '.js',
        '.json',
        '.toml',
        '.tml',
        '.yaml',
        '.yml',
      ]),
      delStr(app.config.baseDir + '/app/schemas/')
    );

    const ForEach = R.tryCatch(path => {
      const content = mi(path);
      path = delAllStr(path).split('/');
      this[CACHE] = schemas = assocPath(path.map(p => camelCase(p)), content, schemas);
    }, console.error);

    paths.forEach(ForEach);
    return schemas;
  },

  get docs() {
    return this.loadDocs(false);
  },

  async verify(path, type) {
    path = path.split('.');
    let open = this.app.config.validator.open;
    if (R.type(open) === 'Function') open = await open(this);
    const messages = this.app.config.validator.languages[open] || {};
    const rules = R.path(path, this.docs);
    const validator = new Validate(rules);
    validator.messages(messages);
    const fields = R.cond([[
      R.equals('query'), R.always(this.request.query),
    ], [
      R.equals('body'), R.always(this.request.body),
    ], [
      R.equals('params'), R.always(this.params),
    ], [
      R.T, R.always(R.merge(this.params, this.request.query, this.request.body)),
    ]])(type);

    return new Promise((resolve, reject) => {
      validator.validate(fields, errors => {
        if (errors) {
          reject(errors);
        }
        resolve();
      });
    });
  },
};
