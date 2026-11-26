/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Apollo CSC
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { describe, it, expect } from 'vitest';
import {
  collectAliasLocalParts,
  emailLocalPart,
  hasReservedBotPrefix,
  isPrefixGuardedObject,
  reservedBotPrefixErrors,
} from './reservedBotPrefix';

const MSG = "Prefixo 'bot-' reservado às contas de agente.";

describe('emailLocalPart', () => {
  it('lowercases a bare local part', () => {
    expect(emailLocalPart('Bot-Mail')).toBe('bot-mail');
  });

  it('strips the domain when an address is given', () => {
    expect(emailLocalPart('Bot-Mail@Example.com')).toBe('bot-mail');
  });

  it('trims whitespace', () => {
    expect(emailLocalPart('  alice@x.com  ')).toBe('alice');
  });
});

describe('hasReservedBotPrefix', () => {
  it('matches bot- at the start of the local part, case-insensitively', () => {
    expect(hasReservedBotPrefix('bot-apollomail')).toBe(true);
    expect(hasReservedBotPrefix('BOT-Agente')).toBe(true);
    expect(hasReservedBotPrefix('Bot-X@apollosolution.com.br')).toBe(true);
  });

  it('does not match other names', () => {
    expect(hasReservedBotPrefix('alice')).toBe(false);
    expect(hasReservedBotPrefix('robot-arm')).toBe(false);
    expect(hasReservedBotPrefix('bot')).toBe(false);
    expect(hasReservedBotPrefix('bot_apollomail')).toBe(false);
    expect(hasReservedBotPrefix('')).toBe(false);
    expect(hasReservedBotPrefix(null)).toBe(false);
    expect(hasReservedBotPrefix(12)).toBe(false);
  });
});

describe('isPrefixGuardedObject', () => {
  it('guards Account, Group-as-Account, and mailing lists', () => {
    expect(isPrefixGuardedObject('x:Account')).toBe(true);
    expect(isPrefixGuardedObject('Account')).toBe(true);
    expect(isPrefixGuardedObject('x:MailingList')).toBe(true);
    expect(isPrefixGuardedObject('MailingList')).toBe(true);
    expect(isPrefixGuardedObject('x:List')).toBe(true);
  });

  it('does not guard unrelated objects', () => {
    expect(isPrefixGuardedObject('x:Domain')).toBe(false);
    expect(isPrefixGuardedObject('x:Directory')).toBe(false);
    expect(isPrefixGuardedObject('x:Role')).toBe(false);
  });
});

describe('collectAliasLocalParts', () => {
  it('reads the Stalwart indexed-object shape', () => {
    expect(
      collectAliasLocalParts({ '0': { name: 'Bot-X', domainId: 'd' }, '1': { name: 'alice', domainId: 'd' } }),
    ).toEqual(new Set(['bot-x', 'alice']));
  });

  it('reads an array and bare strings', () => {
    expect(collectAliasLocalParts([{ name: 'n.doe' }, 'Other@Ex.com'])).toEqual(new Set(['n.doe', 'other']));
  });

  it('returns an empty set for missing aliases', () => {
    expect(collectAliasLocalParts(undefined)).toEqual(new Set());
    expect(collectAliasLocalParts(null)).toEqual(new Set());
  });
});

describe('reservedBotPrefixErrors', () => {
  it('blocks creating an Account whose name starts with bot-', () => {
    expect(
      reservedBotPrefixErrors({ name: 'bot-apollomail' }, { objectName: 'x:Account', isCreate: true }, MSG),
    ).toEqual({ name: MSG });
  });

  it('blocks creating a MailingList or List with a bot- name, including a full address', () => {
    expect(
      reservedBotPrefixErrors(
        { name: 'BOT-lista@apollosolution.com.br' },
        { objectName: 'x:MailingList', isCreate: true },
        MSG,
      ),
    ).toEqual({ name: MSG });
    expect(reservedBotPrefixErrors({ name: 'bot-list' }, { objectName: 'List', isCreate: true }, MSG)).toEqual({
      name: MSG,
    });
  });

  it('blocks a new bot- alias on a human account', () => {
    expect(
      reservedBotPrefixErrors(
        { name: 'alice', aliases: { '0': { name: 'bot-help', domainId: 'd' } } },
        { objectName: 'x:Account', isCreate: true },
        MSG,
      ),
    ).toEqual({ aliases: MSG });
  });

  it('allows ordinary names and aliases', () => {
    expect(
      reservedBotPrefixErrors(
        { name: 'alice', aliases: { '0': { name: 'a.silva', domainId: 'd' } } },
        { objectName: 'x:Account', isCreate: true },
        MSG,
      ),
    ).toEqual({});
  });

  it('does not apply to Domain or other unguarded objects, even with a bot- name', () => {
    expect(reservedBotPrefixErrors({ name: 'bot-something' }, { objectName: 'x:Domain', isCreate: true }, MSG)).toEqual(
      {},
    );
  });

  it('on edit, allows saving other fields when the reserved name is unchanged', () => {
    expect(
      reservedBotPrefixErrors(
        { name: 'bot-apollomail', description: 'quota bump' },
        {
          objectName: 'x:Account',
          isCreate: false,
          originalData: { name: 'bot-apollomail', description: 'old' },
        },
        MSG,
      ),
    ).toEqual({});
  });

  it('on edit, allows an existing reserved alias to stay, but blocks a newly added one', () => {
    const original = { name: 'alice', aliases: { '0': { name: 'bot-legacy', domainId: 'd' } } };
    expect(
      reservedBotPrefixErrors(
        { name: 'alice', aliases: { '0': { name: 'bot-legacy', domainId: 'd' } } },
        { objectName: 'x:Account', isCreate: false, originalData: original },
        MSG,
      ),
    ).toEqual({});
    expect(
      reservedBotPrefixErrors(
        {
          name: 'alice',
          aliases: { '0': { name: 'bot-legacy', domainId: 'd' }, '1': { name: 'bot-novo', domainId: 'd' } },
        },
        { objectName: 'x:Account', isCreate: false, originalData: original },
        MSG,
      ),
    ).toEqual({ aliases: MSG });
  });

  it('on edit, blocks renaming a human account or alias into the reserved prefix', () => {
    expect(
      reservedBotPrefixErrors(
        { name: 'bot-agora' },
        { objectName: 'x:Account', isCreate: false, originalData: { name: 'alice' } },
        MSG,
      ),
    ).toEqual({ name: MSG });
    expect(
      reservedBotPrefixErrors(
        { name: 'bot-apollomail' },
        { objectName: 'x:Account', isCreate: false, originalData: { name: 'bot-legacy' } },
        MSG,
      ),
    ).toEqual({ name: MSG });
  });
});
