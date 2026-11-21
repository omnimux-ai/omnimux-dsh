/**
 * Test-only legacy catalog fixture.
 *
 * Production MUST NOT import this file. The live model catalog is served by
 * the hub at /omnimux/model-catalog; this fixture only preserves old unit-test
 * inputs for parser behavior and is intentionally outside the runtime graph.
 */
import { parseCatalogToCascade } from '../MediaViewerComposerData.js';

/**
 * 真实中枢已知后备目录（与中枢 catalog-defaults 100% 保持一致，拒绝捏造）
 */
export const DEFAULT_FALLBACK_CATALOG = {
  "image": [
    {
      "id": "gpt-image-2.5",
      "label": "GPT Image 2.5",
      "badge": "新品",
      "subtitle": "标准版 1K · 高分档依渠道",
      "family": "openai",
      "parameters": {
        "aspectRatio": {
          "defaultValue": "16:9",
          "options": [
            "auto",
            "1:1",
            "16:9",
            "9:16",
            "4:3",
            "3:4",
            "3:2",
            "2:3",
            "21:9"
          ]
        },
        "resolution": {
          "defaultValue": "1K",
          "options": [
            "1K",
            "2K",
            "4K"
          ]
        },
        "quality": {
          "defaultValue": "standard",
          "options": [
            "standard",
            "hd"
          ]
        },
        "n": {
          "defaultValue": 1,
          "options": [
            1,
            2,
            4
          ]
        }
      },
      "channelGroups": [
        {
          "id": "standard",
          "label": "标准版",
          "default": true,
          "badge": "基础清晰度 · 异步出图",
          "wireGroup": "default",
          "constraints": {
            "parameters": {
              "resolution": {
                "fixed": "1K"
              },
              "quality": {
                "supported": false
              },
              "n": {
                "fixed": 1
              }
            }
          },
          "pricing": {
            "pointsEstimate": 0.13,
            "discountRate": 1,
            "billingMode": "per_task"
          }
        },
        {
          "id": "economy",
          "label": "经济版",
          "badge": "经济走量 · 独立线路",
          "wireGroup": "gpt-image-2.5-economy",
          "pricing": {
            "pointsEstimate": 0.01,
            "discountRate": 0.112455,
            "billingMode": "per_task"
          }
        }
      ]
    },
    {
      "id": "seedream-5-0-pro",
      "label": "Seedream 5.0 Pro",
      "subtitle": "1K-2K",
      "family": "seedream",
      "parameters": {
        "aspectRatio": {
          "defaultValue": "16:9",
          "options": [
            "auto",
            "1:1",
            "16:9",
            "9:16",
            "4:3",
            "3:4",
            "3:2",
            "2:3",
            "21:9"
          ]
        },
        "resolution": {
          "defaultValue": "1K",
          "options": [
            "1K",
            "2K",
            "4K"
          ]
        }
      },
      "channelGroups": [
        {
          "id": "standard",
          "label": "标准版",
          "default": true,
          "badge": "Seedream 官方专线",
          "wireGroup": "default",
          "pricing": {
            "pointsEstimate": 0.64,
            "discountRate": 1,
            "billingMode": "per_task"
          }
        }
      ]
    }
  ],
  "video": [
    {
      "id": "seedance-2-0",
      "label": "Seedance 2.0",
      "subtitle": "480p/720p/1080p/4k · 4–15s · 有声",
      "family": "bytedance",
      "parameters": {
        "aspectRatio": {
          "default": "16:9",
          "options": [
            "16:9",
            "9:16",
            "1:1",
            "4:3",
            "3:4",
            "21:9",
            "自适应"
          ]
        },
        "duration": {
          "default": 5,
          "min": 4,
          "max": 15
        },
        "resolution": {
          "default": "720p",
          "options": [
            "480p",
            "720p",
            "1080p",
            "4k"
          ]
        },
        "sound": {
          "default": true
        }
      },
      "channelGroups": [
        {
          "id": "standard",
          "label": "标准版",
          "default": true,
          "badge": "官方原生专线 · 按秒计费",
          "wireGroup": "default",
          "pricing": {
            "pointsEstimate": 4.9,
            "discountRate": 1,
            "billingMode": "per_second"
          }
        }
      ]
    },
    {
      "id": "seedance-2-5",
      "label": "Seedance 2.5",
      "badge": "旗舰",
      "subtitle": "480p–1080p · 4–30s/自动 · 有声",
      "family": "bytedance",
      "parameters": {
        "aspectRatio": {
          "default": "16:9",
          "options": [
            "16:9",
            "9:16",
            "1:1",
            "4:3",
            "3:4",
            "21:9",
            "自适应"
          ]
        },
        "duration": {
          "default": 5,
          "min": 4,
          "max": 30
        },
        "resolution": {
          "default": "1080p",
          "options": [
            "480p",
            "720p",
            "1080p"
          ]
        },
        "sound": {
          "default": true
        }
      },
      "channelGroups": [
        {
          "id": "480p",
          "label": "经济版",
          "badge": "480p 档 · 经济走量",
          "wireGroup": "desktop-480p",
          "pricing": {
            "pointsEstimate": 6.8,
            "discountRate": 0.17,
            "billingMode": "per_second"
          }
        },
        {
          "id": "720p",
          "label": "标准版",
          "default": true,
          "badge": "720p 档 · 稳定满血",
          "wireGroup": "desktop-720p",
          "pricing": {
            "pointsEstimate": 9.6,
            "discountRate": 0.24,
            "billingMode": "per_second"
          }
        }
      ]
    }
  ]
};

export const DEFAULT_CASCADE_MODELS = [
  ...parseCatalogToCascade(DEFAULT_FALLBACK_CATALOG.video),
  ...parseCatalogToCascade(DEFAULT_FALLBACK_CATALOG.image),
];
