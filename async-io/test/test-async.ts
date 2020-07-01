import * as assert from 'assert';
import { suite, test } from '@testdeck/mocha';
import * as os from 'os';
import * as asyncio from '../main';

@suite class AsyncIO {

  @test async 'Does promisify\'d exist work'() {
    assert.equal(await asyncio.exists(__filename), true);
  }

  @test async 'mkdir'() {
    const tmpFolder = `${os.tmpdir()}/something/deep/deep/inside`;
    await asyncio.rmdir(`${os.tmpdir()}/something`);

    await asyncio.mkdir(tmpFolder);
    assert.equal(await asyncio.isDirectory(tmpFolder), true, 'Deep Directory created');

    // making it again should not fail
    await asyncio.mkdir(tmpFolder);
    assert.equal(await asyncio.isDirectory(tmpFolder), true, 'still there...');

    await asyncio.rmdir(`${os.tmpdir()}/something`);
    assert.equal(await asyncio.isDirectory(tmpFolder), false, 'removed ');

    await asyncio.rmdir(tmpFolder);
    assert.equal(await asyncio.isDirectory(tmpFolder), false, 'no worries ');

  }

}
