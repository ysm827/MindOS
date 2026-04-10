/**
 * Channel Validation - Field and Format Validation
 */

// Platform-specific validation patterns
/** @type {Record<string, {required: string[], patterns?: Record<string, RegExp>}>} */
const VALIDATION_PATTERNS = {
  telegram: {
    required: ['bot_token'],
    patterns: {
      bot_token: /^\d+:[A-Za-z0-9_-]{25,}$/, // e.g., 123456:ABC-DEF_123
    },
  },
  discord: {
    required: ['bot_token'],
    patterns: {
      bot_token: /^[A-Za-z0-9_-]{60,}$/, // Long token
    },
  },
  feishu: {
    required: ['app_id', 'app_secret'],
  },
  slack: {
    required: ['bot_token'],
    patterns: {
      bot_token: /^xoxb-/, // Must start with xoxb-
    },
  },
  wecom: {
    required: ['webhook_key'], // OR corp_id + corp_secret
  },
  dingtalk: {
    required: ['client_id', 'client_secret'], // OR webhook_url
  },
  wechat: {
    required: ['bot_token'],
  },
  qq: {
    required: ['app_id', 'app_secret'],
  },
};

/**
 * Validate field format
 * @param {string} platform
 * @param {string} field
 * @param {string} value
 * @returns {{valid: boolean, error?: string}}
 */
export function validateFieldFormat(platform, field, value) {
  if (!value || value.trim() === '') {
    return { valid: false, error: `${field} cannot be empty` };
  }

  const patterns = VALIDATION_PATTERNS[platform]?.patterns;
  if (patterns && patterns[field]) {
    if (!patterns[field].test(value)) {
      return { valid: false, error: `Invalid ${field} format for ${platform}` };
    }
  }

  return { valid: true };
}

/**
 * Get required fields for a platform
 * @param {string} platform
 * @returns {string[]}
 */
export function getRequiredFields(platform) {
  return VALIDATION_PATTERNS[platform]?.required || [];
}

/**
 * Get field help text
 * @param {string} platform
 * @param {string} field
 * @returns {string}
 */
export function getFieldHelp(platform, field) {
  /** @type {Record<string, Record<string, string>>} */
  const helpTexts = {
    telegram: {
      bot_token: 'Get from @BotFather on Telegram (https://core.telegram.org/bots)',
    },
    discord: {
      bot_token: 'Get from Discord Developer Portal (https://discord.com/developers)',
    },
    feishu: {
      app_id: 'Get from Feishu Admin Console',
      app_secret: 'Get from Feishu Admin Console',
    },
    slack: {
      bot_token: 'Get from Slack API settings (https://api.slack.com/apps)',
    },
    wecom: {
      webhook_key: 'Get from WeChat Enterprise admin panel',
    },
    dingtalk: {
      client_id: 'Get from DingTalk Developer Console',
      client_secret: 'Get from DingTalk Developer Console',
    },
    wechat: {
      bot_token: 'Get via ClawBot QR scan',
    },
    qq: {
      app_id: 'Get from QQ Open Platform',
      app_secret: 'Get from QQ Open Platform',
    },
  };

  return helpTexts[platform]?.[field] || '';
}
