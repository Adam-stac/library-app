export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'test', 'refactor', 'docs', 'chore', 'ci', 'security', 'perf', 'build', 'revert'],
    ],
  },
};
