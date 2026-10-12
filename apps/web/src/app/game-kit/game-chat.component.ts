import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { CHAT_MAX_LENGTH, type GameSession } from '../game-client/game-session';
import { ButtonComponent } from '../ui/button/button.component';

let nextId = 0;

/**
 * Table chat for a game: messages since this browser joined (nothing is stored on the server),
 * newest at the bottom, and a one-line input. New messages from others are announced politely.
 */
@Component({
  selector: 'bt-game-chat',
  imports: [ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="title" [id]="titleId">Chat</h2>
    <!-- scrollable, so it must be reachable by keyboard -->
    <ol #list class="messages" tabindex="0" [attr.aria-labelledby]="titleId">
      @for (m of lines(); track m.id) {
        <li [class.mine]="m.mine">
          <span class="who">{{ m.who }}:</span><span class="text"> {{ m.text }}</span>
        </li>
      } @empty {
        <li class="empty">Say hello to the table.</li>
      }
    </ol>
    <p class="bt-visually-hidden" aria-live="polite">{{ announcement() }}</p>
    <form class="compose" (submit)="send($event)">
      <input
        class="bt-input"
        name="message"
        aria-label="Message to the table"
        autocomplete="off"
        [maxLength]="maxLength"
        [value]="draft()"
        (input)="draft.set(value($event))"
      />
      <button bt-button size="sm" type="submit" [disabled]="!canSend()">Send</button>
    </form>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: var(--bt-space-2);
      min-height: 0;
    }
    .title {
      font-size: var(--bt-text-lg);
    }
    .messages {
      display: grid;
      align-content: start;
      gap: var(--bt-space-1);
      min-height: 4rem;
      overflow-y: auto;
      margin: 0;
      padding: var(--bt-space-2) var(--bt-space-3);
      border: var(--bt-border-width) solid var(--bt-color-border);
      border-radius: var(--bt-radius-md);
      background: var(--bt-color-surface);
      list-style: none;
      font-size: var(--bt-text-sm);
      overflow-wrap: anywhere;
    }
    .messages:focus-visible {
      outline: none;
      box-shadow: var(--bt-focus-ring);
    }
    .who {
      font-weight: 600;
    }
    .mine .who {
      color: var(--bt-color-accent-text);
    }
    .empty {
      color: var(--bt-color-text-muted);
    }
    .compose {
      display: flex;
      gap: var(--bt-space-2);
    }
    .compose input {
      flex: 1;
      min-width: 0;
    }
  `,
})
export class GameChatComponent {
  readonly session = input.required<GameSession<unknown>>();

  protected readonly maxLength = CHAT_MAX_LENGTH;
  protected readonly titleId = `bt-chat-title-${nextId++}`;
  protected readonly draft = signal('');
  protected readonly canSend = computed(() => {
    const line = this.draft().trim();
    return line.length > 0 && line.length <= CHAT_MAX_LENGTH && this.session().isConnected();
  });

  protected readonly lines = computed(() => {
    const session = this.session();
    const names = new Map(session.players().map((p) => [p.playerID, p.name]));
    return session.chatMessages().map((m) => {
      const mine = m.sender === session.playerID;
      return {
        id: m.id,
        mine,
        who: mine ? 'You' : (names.get(m.sender) ?? `Player ${Number(m.sender) + 1}`),
        text: m.payload,
      };
    });
  });

  /** The latest message from someone else, for screen readers. */
  protected readonly announcement = computed(() => {
    const last = this.lines().at(-1);
    return last && !last.mine ? `${last.who}: ${last.text}` : '';
  });

  private readonly list = viewChild.required<ElementRef<HTMLElement>>('list');

  constructor() {
    // keep the newest message in view
    afterRenderEffect(() => {
      this.lines();
      const el = this.list().nativeElement;
      el.scrollTop = el.scrollHeight;
    });
  }

  protected value(event: Event) {
    return (event.target as HTMLInputElement).value;
  }

  protected send(event: Event) {
    event.preventDefault();
    if (!this.canSend()) return;
    this.session().sendChat(this.draft());
    this.draft.set('');
  }
}
