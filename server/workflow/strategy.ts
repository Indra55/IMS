/**
 * Strategy Pattern — Alert severity routing.
 *
 * Each component type maps to a priority level, and each priority level
 * has a concrete AlertStrategy that determines how to notify responders.
 *
 * Priority mapping (from ip.md):
 *   RDBMS, MCP_HOST  → P0 → P0CriticalAlert
 *   API, QUEUE       → P1 → P1HighAlert
 *   CACHE            → P2 → P2MediumAlert
 *   NOSQL            → P3 → P3LowAlert
 */

import type { WorkItem, Priority } from '../models/types.js';
import { COMPONENT_PRIORITY_MAP } from '../models/types.js';
import type { ComponentType } from '../models/Signal.js';
import type { AlertStrategy } from './types.js';
import { config } from '../config.js';

/** Helper to send Discord Webhook if configured */
async function sendDiscordWebhook(priority: Priority, color: number, workItem: WorkItem, message: string) {
  if (!config.DISCORD_WEBHOOK_URL) return;

  try {
    await fetch(config.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: `[${priority}] Incident Alert: ${workItem.title}`,
            description: message,
            color: color,
            fields: [
              { name: 'Component ID', value: workItem.component_id, inline: true },
              { name: 'Status', value: workItem.state, inline: true },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch (err) {
    console.error(`[Webhook] Failed to send Discord alert for ${workItem.id}:`, err);
  }
}

export class P0CriticalAlert implements AlertStrategy {
  readonly priority: Priority = 'P0';

  async alert(workItem: WorkItem): Promise<void> {
    const msg = `🚨 [P0 CRITICAL] ${workItem.title} | component=${workItem.component_id} | Immediate escalation required`;
    console.error(msg);
    await sendDiscordWebhook('P0', 0xff0000, workItem, msg);
  }
}

export class P1HighAlert implements AlertStrategy {
  readonly priority: Priority = 'P1';

  async alert(workItem: WorkItem): Promise<void> {
    const msg = `⚠️  [P1 HIGH] ${workItem.title} | component=${workItem.component_id} | Escalation in 5 min if not acknowledged`;
    console.warn(msg);
    await sendDiscordWebhook('P1', 0xffa500, workItem, msg);
  }
}

export class P2MediumAlert implements AlertStrategy {
  readonly priority: Priority = 'P2';

  async alert(workItem: WorkItem): Promise<void> {
    console.info(
      `ℹ️  [P2 MEDIUM] ${workItem.title} | component=${workItem.component_id}`,
    );
  }
}

export class P3LowAlert implements AlertStrategy {
  readonly priority: Priority = 'P3';

  async alert(workItem: WorkItem): Promise<void> {
    console.debug(
      `📝 [P3 LOW] ${workItem.title} | component=${workItem.component_id}`,
    );
  }
}


const STRATEGY_MAP: Record<Priority, AlertStrategy> = {
  P0: new P0CriticalAlert(),
  P1: new P1HighAlert(),
  P2: new P2MediumAlert(),
  P3: new P3LowAlert(),
};

/**
 * Resolve the correct AlertStrategy for a given priority level.
 * Falls back to P2MediumAlert if the priority is unknown.
 */
export function resolveAlertStrategy(priority: Priority): AlertStrategy {
  return STRATEGY_MAP[priority] ?? STRATEGY_MAP.P2;
}

// ─── Alert Router ────────────────────────────────────────────────────────────

/**
 * High-level entry point: given a component type, resolve its priority
 * and fire the appropriate alert strategy.
 *
 * @example
 * await routeAlert('RDBMS', workItem);  // → P0CriticalAlert.alert()
 */
export async function routeAlert(
  componentType: ComponentType,
  workItem: WorkItem,
): Promise<void> {
  const priority = COMPONENT_PRIORITY_MAP[componentType] ?? 'P2';
  const strategy = resolveAlertStrategy(priority);
  await strategy.alert(workItem);
}
