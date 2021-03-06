import { Disposable } from 'event-kit'
import { Dispatcher } from '../src/lib/dispatcher'
import { User } from '../src/models/user'
import { Repository } from '../src/models/repository'

type State = {users: ReadonlyArray<User>, repositories: ReadonlyArray<Repository>}

export class InMemoryDispatcher extends Dispatcher {
  public onDidUpdate(fn: (state: State) => void): Disposable {
    return new Disposable(() => {})
  }
}
