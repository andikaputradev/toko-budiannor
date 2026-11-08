import type { PaidMethod } from '../../../shared/data/types';
import { el } from '../../../shared/dom';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { channelsOf } from '../domain/channels';

export interface ChannelCard {
  readonly method: PaidMethod;
  readonly channel: string | undefined;
  readonly text: string;
}

export interface ChannelCards {
  readonly element: HTMLElement;
  select(method: PaidMethod | undefined, channel: string | undefined): void;
}

// Kartu kanal non-tunai: QRIS dan dompet digital, EDC, lalu Transfer per bank.
export function channelCards(): readonly ChannelCard[] {
  return [
    { method: 'qris', channel: undefined, text: label('metodeQris') },
    ...channelsOf('qris').map((channel) => ({ method: 'qris' as const, channel, text: channel })),
    { method: 'edc', channel: undefined, text: label('metodeEdc') },
    ...channelsOf('transfer').map((channel) => ({
      method: 'transfer' as const,
      channel,
      text: `${label('metodeTransfer')} ${channel}`,
    })),
  ];
}

export function createChannelCards(onPick: (card: ChannelCard) => void): ChannelCards {
  const element = el('div', {
    className: 'pos-pay__cards',
    attrs: { role: 'group', 'aria-label': label('kanalPembayaran') },
  });
  const buttons = new Map<ChannelCard, HTMLButtonElement>();
  for (const card of channelCards()) {
    const button = createButton({
      text: card.text,
      variant: 'secondary',
      onClick: () => {
        onPick(card);
      },
    });
    button.classList.add('pos-pay__method', 'pos-pay__card');
    buttons.set(card, button);
    element.append(button);
  }
  return {
    element,
    select(method, channel) {
      for (const [card, button] of buttons) {
        const chosen = method === card.method && channel === card.channel;
        button.setAttribute('aria-pressed', chosen ? 'true' : 'false');
      }
    },
  };
}
