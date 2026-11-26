/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Apollo CSC
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

/** Local-part prefix reserved for Apollo agent mailboxes (bot-*@apollosolution.com.br). */
export const RESERVED_BOT_PREFIX = 'bot-';

const DEFAULT_MESSAGE = "The 'bot-' prefix is reserved for agent accounts.";

const GUARDED_OBJECTS = new Set(['account', 'mailinglist', 'list']);

/** Canonical object type without the Stalwart `x:` prefix, lowercased. */
export function canonicalObjectName(objectName: string): string {
  return objectName.trim().replace(/^x:/i, '').toLowerCase();
}

export function isPrefixGuardedObject(objectName: string): boolean {
  return GUARDED_OBJECTS.has(canonicalObjectName(objectName));
}

/**
 * Local part of an address or of a bare local-part field.
 * `Bot-Mail@Example.com` and `Bot-Mail` both yield `bot-mail`.
 */
export function emailLocalPart(value: string): string {
  const trimmed = value.trim();
  const at = trimmed.indexOf('@');
  return (at === -1 ? trimmed : trimmed.slice(0, at)).toLowerCase();
}

export function hasReservedBotPrefix(value: unknown): boolean {
  if (typeof value !== 'string' || value.trim() === '') return false;
  return emailLocalPart(value).startsWith(RESERVED_BOT_PREFIX);
}

function aliasName(entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object' && 'name' in entry) {
    const name = (entry as { name: unknown }).name;
    return typeof name === 'string' ? name : undefined;
  }
  return undefined;
}

/** Collect local parts from the Stalwart aliases map (indexed object) or an array. */
export function collectAliasLocalParts(aliases: unknown): Set<string> {
  const parts = new Set<string>();
  if (aliases == null) return parts;
  const values = Array.isArray(aliases)
    ? aliases
    : typeof aliases === 'object'
      ? Object.values(aliases as Record<string, unknown>)
      : [];
  for (const entry of values) {
    const name = aliasName(entry);
    if (name && name.trim() !== '') parts.add(emailLocalPart(name));
  }
  return parts;
}

export interface ReservedBotPrefixOptions {
  objectName: string;
  isCreate: boolean;
  originalData?: Record<string, unknown> | null;
}

/**
 * Field errors for Account (User/Group) and MailingList forms when the local
 * part of `name` or of any alias starts with `bot-`.
 *
 * On edit, an unchanged reserved value already stored on the object is allowed
 * (so quota/description of an existing agent account can still be saved).
 * Changing a name or adding an alias into the reserved prefix is always blocked.
 */
export function reservedBotPrefixErrors(
  formData: Record<string, unknown>,
  options: ReservedBotPrefixOptions,
  message: string = DEFAULT_MESSAGE,
): Record<string, string> {
  if (!isPrefixGuardedObject(options.objectName)) return {};

  const errors: Record<string, string> = {};
  const original = options.isCreate ? undefined : (options.originalData ?? undefined);

  if (hasReservedBotPrefix(formData.name)) {
    const unchanged =
      typeof original?.name === 'string' && emailLocalPart(String(formData.name)) === emailLocalPart(original.name);
    if (!unchanged) errors.name = message;
  }

  const currentAliasParts = collectAliasLocalParts(formData.aliases);
  if (currentAliasParts.size > 0) {
    const originalAliasParts = collectAliasLocalParts(original?.aliases);
    for (const part of currentAliasParts) {
      if (part.startsWith(RESERVED_BOT_PREFIX) && !originalAliasParts.has(part)) {
        errors.aliases = message;
        break;
      }
    }
  }

  return errors;
}
