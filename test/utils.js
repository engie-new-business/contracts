async function assertRevertWith(promise, expectedError) {
  try {
    await promise;
    assert.fail('expected operation to fail with: '+ expectedError);
  } catch (e) {
    assert.match(e.message, new RegExp(`Reason given: ${expectedError}`));
  }
}

module.exports = {
  assertRevertWith,
};
