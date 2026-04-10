/**
 * Channel Prompts - Interactive User Input
 * Handles: hidden inputs, confirmations, retries
 */

import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });

/**
 * Prompt for hidden input (password mode)
 * @param {string} question
 * @returns {Promise<string>}
 */
export async function promptHidden(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Prompt for confirmation (y/n)
 * @param {string} question
 * @param {boolean} [defaultValue]
 * @returns {Promise<boolean>}
 */
export async function promptConfirm(question, defaultValue = false) {
  return new Promise((resolve) => {
    const prompt = defaultValue ? `${question} (Y/n): ` : `${question} (y/N): `;
    rl.question(prompt, (answer) => {
      const normalized = answer.toLowerCase().trim();
      if (defaultValue) {
        resolve(normalized !== 'n');
      } else {
        resolve(normalized === 'y');
      }
    });
  });
}

/**
 * Prompt for single choice from options
 * @param {string} question
 * @param {string[]} options
 * @returns {Promise<string | null>}
 */
export async function promptChoice(question, options) {
  return new Promise((resolve) => {
    console.log(question);
    options.forEach((opt, i) => {
      console.log(`  [${i + 1}] ${opt}`);
    });
    rl.question(`Choose (1-${options.length}): `, (answer) => {
      const idx = parseInt(answer, 10) - 1;
      if (idx >= 0 && idx < options.length) {
        resolve(options[idx]);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Close readline interface
 */
export function closePrompts() {
  rl.close();
}
