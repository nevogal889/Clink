/* global jest */
// Native modules without a jest-expo mock. The data layer's tests inject memory stores; this only
// keeps imports of the native storage module from failing.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
