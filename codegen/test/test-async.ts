import * as assert from 'assert';
import { suite, test } from '@testdeck/mocha';
import { toSemver } from '../apiversion';

@suite class ApiVersion {

  @test async 'to semver conversion'() {
    const actual1 = toSemver('6.2.0.9');
    const expected1 = '6.2.0';
    assert.strictEqual(actual1, expected1);

    const actual2 = toSemver('2017-10-12');
    const expected2 = '2017.10.12';
    assert.strictEqual(actual2, expected2);

    const actual3 = toSemver('2017-10-12-preview');
    const expected3 = '2017.10.12-preview';
    assert.strictEqual(actual3, expected3);

    const actual4 = toSemver('v2.1');
    const expected4 = '2.1.0';
    assert.strictEqual(actual4, expected4);

    const actual5 = toSemver('1.1');
    const expected5 = '1.1.0';
    assert.strictEqual(actual5, expected5);

    const actual6 = toSemver('2016-07-01.3.1');
    const expected6 = '1467331200000.3.1';
    assert.strictEqual(actual6, expected6);

    const actual7 = toSemver('1.3.1');
    const expected7 = '1.3.1';
    assert.strictEqual(actual7, expected7);

    assert.strictEqual(toSemver('v1'), '1.0.0');

    assert.strictEqual(toSemver('3.0-preview.1'), '3.0.0-preview.1');
  }
}
