import { suite, test } from '@testdeck/mocha';
import * as tasks from '@azure-tools/tasks';
import * as assert from 'assert';

import { IEvent, EventEmitter } from '../main';

export class MyClass extends EventEmitter {

  @EventEmitter.Event public Debug!: IEvent<MyClass, string>;

  public go() {
    this.Debug.Dispatch('Hello');
  }
}

@suite class Eventing {

  @test async 'Do Events Work'() {
    const instance = new MyClass();
    let worksWithSubscribe = 'no';
    let worksLikeNode = 'no';

    instance.on('Debug', (inst: MyClass, s: string) => {
      worksLikeNode = s;
    });

    const unsub = instance.Debug.Subscribe((instance, args) => {
      worksWithSubscribe = args;
    });

    instance.go();

    // test out subscribe
    assert.equal(worksLikeNode, 'Hello');
    assert.equal(worksWithSubscribe, 'Hello');

    // test out unsubscribe      
    worksWithSubscribe = 'no';
    unsub();

    assert.equal(worksWithSubscribe, 'no');
  }
}
