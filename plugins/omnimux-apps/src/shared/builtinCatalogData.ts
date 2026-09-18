/**
 * plugins/omnimux-apps/src/shared/builtinCatalogData.ts
 *
 * 官方出厂内置 AI 应用清单与工作流快照（静态内联，零文件 IO 依赖）
 */

export const BUILTIN_MANIFESTS = Object.freeze([
  {
    "schemaVersion": "1.0.0",
    "appId": "app-creatify-app-demo",
    "version": "1.0.0",
    "workflowBinding": {
      "workspaceId": "ws-app-creatify-app-demo",
      "workflowVersion": 1
    },
    "metadata": {
      "name": "手机与网页交互实机演示",
      "category": "video",
      "description": "适用于 SaaS 界面穿屏、手机 App 操作流程实录与软件出海推广",
      "icon": "video",
      "tags": [
        "creatify",
        "apps-software",
        "e-commerce",
        "viral-video"
      ],
      "author": "OmniMux Official"
    },
    "formSchema": {
      "type": "object",
      "properties": {
        "product_image": {
          "type": "string",
          "title": "商品主图 / 白底图",
          "description": "支持拖拽上传高清商品图，或粘贴电商链接自动解析",
          "widget": "media-uploader",
          "default": "https://cdn.creatify.ai/community_creation/f23489b3-2ea5-41bb-9c2c-91d35d71e236/preview_image_35c9be15.webp"
        },
        "copywriting": {
          "type": "string",
          "title": "核心卖点与旁白分镜",
          "description": "填入 1~3 句核心商品卖点，AI 将自动融合至爆款分镜节奏",
          "widget": "textarea",
          "default": "Place your laptop screenshot into this engaging UGC video where a friendly young woman sits in a cozy home working space and presents your digital product on her laptop. Horizontal laptop screenshot/ image works the best."
        },
        "voice": {
          "type": "string",
          "title": "解说人声音色",
          "description": "选择适合该视频情绪的 AI 配音解说音色",
          "widget": "select-single",
          "default": "zh_female_energetic",
          "options": [
            {
              "label": "活力女声（电商促销爆款）",
              "value": "zh_female_energetic"
            },
            {
              "label": "沉稳男声（数码科技大片）",
              "value": "zh_male_calm"
            },
            {
              "label": "亲和闺蜜（达人开箱真实种草）",
              "value": "zh_female_friendly"
            },
            {
              "label": "磁性男声（高端商业质感）",
              "value": "zh_male_deep"
            }
          ]
        },
        "aspect_ratio": {
          "type": "string",
          "title": "视频成片比例",
          "description": "选择适用的平台播放比例",
          "widget": "ratio-cards",
          "default": "9:16",
          "options": [
            {
              "label": "9:16 竖屏 (TikTok / Shorts)",
              "value": "9:16"
            },
            {
              "label": "16:9 横屏 (YouTube / 官网)",
              "value": "16:9"
            },
            {
              "label": "1:1 方屏 (Instagram / 推广)",
              "value": "1:1"
            }
          ]
        }
      },
      "required": [
        "product_image",
        "copywriting"
      ],
      "additionalProperties": false
    },
    "fieldMappings": {
      "product_image": {
        "nodeId": "node-slot-product-image",
        "targetField": "mediaUrl",
        "mappingType": "media",
        "widget": "media-uploader",
        "required": true,
        "defaultValue": "https://cdn.creatify.ai/community_creation/f23489b3-2ea5-41bb-9c2c-91d35d71e236/preview_image_35c9be15.webp"
      },
      "copywriting": {
        "nodeId": "node-slot-copywriting",
        "targetField": "content",
        "mappingType": "text",
        "widget": "textarea",
        "required": true,
        "defaultValue": "Place your laptop screenshot into this engaging UGC video where a friendly young woman sits in a cozy home working space and presents your digital product on her laptop. Horizontal laptop screenshot/ image works the best."
      },
      "voice": {
        "nodeId": "node-slot-voice-tts",
        "targetField": "params.voice",
        "mappingType": "param",
        "widget": "select-single",
        "required": false,
        "defaultValue": "zh_female_energetic"
      },
      "aspect_ratio": {
        "nodeId": "node-video-generation-core",
        "targetField": "params.aspectRatio",
        "mappingType": "param",
        "widget": "ratio-cards",
        "required": false,
        "defaultValue": "9:16"
      }
    },
    "showcase": {
      "mode": "carousel",
      "items": [
        {
          "id": "showcase-app-creatify-app-demo-01",
          "title": "爆款成片效果演示",
          "mediaType": "video",
          "mediaUrl": "https://cdn.creatify.ai/community_creation/f23489b3-2ea5-41bb-9c2c-91d35d71e236/preview_video_fc46dffa_compressed_v2.mp4",
          "posterUrl": "https://cdn.creatify.ai/community_creation/f23489b3-2ea5-41bb-9c2c-91d35d71e236/preview_image_35c9be15.webp"
        }
      ]
    }
  },
  {
    "schemaVersion": "1.0.0",
    "appId": "app-creatify-chasing-product",
    "version": "1.0.0",
    "workflowBinding": {
      "workspaceId": "ws-app-creatify-chasing-product",
      "workflowVersion": 1
    },
    "metadata": {
      "name": "巨型商品撞屏与荒诞追逐",
      "category": "video",
      "description": "专治前3秒滑走：巨型商品撞屏、路人惊呼追逐与戏剧性反差",
      "icon": "video",
      "tags": [
        "creatify",
        "hook-intro",
        "e-commerce",
        "viral-video"
      ],
      "author": "OmniMux Official"
    },
    "formSchema": {
      "type": "object",
      "properties": {
        "product_image": {
          "type": "string",
          "title": "商品主图 / 白底图",
          "description": "支持拖拽上传高清商品图，或粘贴电商链接自动解析",
          "widget": "media-uploader",
          "default": "https://cdn.creatify.ai/community_creation/dc1c50e1-f8cd-4120-a772-5a34730aeea4/preview_image_e97194d0.webp"
        },
        "copywriting": {
          "type": "string",
          "title": "核心卖点与旁白分镜",
          "description": "填入 1~3 句核心商品卖点，AI 将自动融合至爆款分镜节奏",
          "widget": "textarea",
          "default": "Showcase your product being desperately chased by a group of adult with intense craving energy. This creates a powerful “everyone wants this” vibe that instantly triggers desire and FOMO. Perfect for most handheld products."
        },
        "voice": {
          "type": "string",
          "title": "解说人声音色",
          "description": "选择适合该视频情绪的 AI 配音解说音色",
          "widget": "select-single",
          "default": "zh_female_energetic",
          "options": [
            {
              "label": "活力女声（电商促销爆款）",
              "value": "zh_female_energetic"
            },
            {
              "label": "沉稳男声（数码科技大片）",
              "value": "zh_male_calm"
            },
            {
              "label": "亲和闺蜜（达人开箱真实种草）",
              "value": "zh_female_friendly"
            },
            {
              "label": "磁性男声（高端商业质感）",
              "value": "zh_male_deep"
            }
          ]
        },
        "aspect_ratio": {
          "type": "string",
          "title": "视频成片比例",
          "description": "选择适用的平台播放比例",
          "widget": "ratio-cards",
          "default": "9:16",
          "options": [
            {
              "label": "9:16 竖屏 (TikTok / Shorts)",
              "value": "9:16"
            },
            {
              "label": "16:9 横屏 (YouTube / 官网)",
              "value": "16:9"
            },
            {
              "label": "1:1 方屏 (Instagram / 推广)",
              "value": "1:1"
            }
          ]
        }
      },
      "required": [
        "product_image",
        "copywriting"
      ],
      "additionalProperties": false
    },
    "fieldMappings": {
      "product_image": {
        "nodeId": "node-slot-product-image",
        "targetField": "mediaUrl",
        "mappingType": "media",
        "widget": "media-uploader",
        "required": true,
        "defaultValue": "https://cdn.creatify.ai/community_creation/dc1c50e1-f8cd-4120-a772-5a34730aeea4/preview_image_e97194d0.webp"
      },
      "copywriting": {
        "nodeId": "node-slot-copywriting",
        "targetField": "content",
        "mappingType": "text",
        "widget": "textarea",
        "required": true,
        "defaultValue": "Showcase your product being desperately chased by a group of adult with intense craving energy. This creates a powerful “everyone wants this” vibe that instantly triggers desire and FOMO. Perfect for most handheld products."
      },
      "voice": {
        "nodeId": "node-slot-voice-tts",
        "targetField": "params.voice",
        "mappingType": "param",
        "widget": "select-single",
        "required": false,
        "defaultValue": "zh_female_energetic"
      },
      "aspect_ratio": {
        "nodeId": "node-video-generation-core",
        "targetField": "params.aspectRatio",
        "mappingType": "param",
        "widget": "ratio-cards",
        "required": false,
        "defaultValue": "9:16"
      }
    },
    "showcase": {
      "mode": "carousel",
      "items": [
        {
          "id": "showcase-app-creatify-chasing-product-01",
          "title": "爆款成片效果演示",
          "mediaType": "video",
          "mediaUrl": "https://cdn.creatify.ai/community_creation/dc1c50e1-f8cd-4120-a772-5a34730aeea4/preview_video_f049866c_compressed_v2.mp4",
          "posterUrl": "https://cdn.creatify.ai/community_creation/dc1c50e1-f8cd-4120-a772-5a34730aeea4/preview_image_e97194d0.webp"
        }
      ]
    }
  },
  {
    "schemaVersion": "1.0.0",
    "appId": "app-creatify-ugc-selfie",
    "version": "1.0.0",
    "workflowBinding": {
      "workspaceId": "ws-app-creatify-ugc-selfie",
      "workflowVersion": 1
    },
    "metadata": {
      "name": "海外达人自拍第一视角口播评测",
      "category": "video",
      "description": "降低买家防备心：海外真实达人自拍口播、手持展示与痛点实测吐槽",
      "icon": "video",
      "tags": [
        "creatify",
        "ugc-review",
        "e-commerce",
        "viral-video"
      ],
      "author": "OmniMux Official"
    },
    "formSchema": {
      "type": "object",
      "properties": {
        "product_image": {
          "type": "string",
          "title": "商品主图 / 白底图",
          "description": "支持拖拽上传高清商品图，或粘贴电商链接自动解析",
          "widget": "media-uploader",
          "default": "https://cdn.creatify.ai/community_creation/decc9021-4f2a-4d0c-8493-df845635716d/preview_image_d7f74acc.webp"
        },
        "copywriting": {
          "type": "string",
          "title": "核心卖点与旁白分镜",
          "description": "填入 1~3 句核心商品卖点，AI 将自动融合至爆款分镜节奏",
          "widget": "textarea",
          "default": "A 20s video with casual, authentic UGC yapping style—friendly, natural, and relatable. Alternating front-facing selfie clips with product close-ups. Simply input info to try it out."
        },
        "voice": {
          "type": "string",
          "title": "解说人声音色",
          "description": "选择适合该视频情绪的 AI 配音解说音色",
          "widget": "select-single",
          "default": "zh_female_energetic",
          "options": [
            {
              "label": "活力女声（电商促销爆款）",
              "value": "zh_female_energetic"
            },
            {
              "label": "沉稳男声（数码科技大片）",
              "value": "zh_male_calm"
            },
            {
              "label": "亲和闺蜜（达人开箱真实种草）",
              "value": "zh_female_friendly"
            },
            {
              "label": "磁性男声（高端商业质感）",
              "value": "zh_male_deep"
            }
          ]
        },
        "aspect_ratio": {
          "type": "string",
          "title": "视频成片比例",
          "description": "选择适用的平台播放比例",
          "widget": "ratio-cards",
          "default": "9:16",
          "options": [
            {
              "label": "9:16 竖屏 (TikTok / Shorts)",
              "value": "9:16"
            },
            {
              "label": "16:9 横屏 (YouTube / 官网)",
              "value": "16:9"
            },
            {
              "label": "1:1 方屏 (Instagram / 推广)",
              "value": "1:1"
            }
          ]
        }
      },
      "required": [
        "product_image",
        "copywriting"
      ],
      "additionalProperties": false
    },
    "fieldMappings": {
      "product_image": {
        "nodeId": "node-slot-product-image",
        "targetField": "mediaUrl",
        "mappingType": "media",
        "widget": "media-uploader",
        "required": true,
        "defaultValue": "https://cdn.creatify.ai/community_creation/decc9021-4f2a-4d0c-8493-df845635716d/preview_image_d7f74acc.webp"
      },
      "copywriting": {
        "nodeId": "node-slot-copywriting",
        "targetField": "content",
        "mappingType": "text",
        "widget": "textarea",
        "required": true,
        "defaultValue": "A 20s video with casual, authentic UGC yapping style—friendly, natural, and relatable. Alternating front-facing selfie clips with product close-ups. Simply input info to try it out."
      },
      "voice": {
        "nodeId": "node-slot-voice-tts",
        "targetField": "params.voice",
        "mappingType": "param",
        "widget": "select-single",
        "required": false,
        "defaultValue": "zh_female_energetic"
      },
      "aspect_ratio": {
        "nodeId": "node-video-generation-core",
        "targetField": "params.aspectRatio",
        "mappingType": "param",
        "widget": "ratio-cards",
        "required": false,
        "defaultValue": "9:16"
      }
    },
    "showcase": {
      "mode": "carousel",
      "items": [
        {
          "id": "showcase-app-creatify-ugc-selfie-01",
          "title": "爆款成片效果演示",
          "mediaType": "video",
          "mediaUrl": "https://cdn.creatify.ai/community_creation/decc9021-4f2a-4d0c-8493-df845635716d/preview_video_c2f93f97_compressed_v2.mp4",
          "posterUrl": "https://cdn.creatify.ai/community_creation/decc9021-4f2a-4d0c-8493-df845635716d/preview_image_d7f74acc.webp"
        }
      ]
    }
  },
  {
    "schemaVersion": "1.0.0",
    "appId": "app-creatify-3d-cute-vfx",
    "version": "1.0.0",
    "workflowBinding": {
      "workspaceId": "ws-app-creatify-3d-cute-vfx",
      "workflowVersion": 1
    },
    "metadata": {
      "name": "3D 视效粒子与动态破屏大片",
      "category": "video",
      "description": "营造高端电影质感：3D 光影粒子环绕、超现实悬浮与破屏动效",
      "icon": "video",
      "tags": [
        "creatify",
        "cinematic-vfx",
        "e-commerce",
        "viral-video"
      ],
      "author": "OmniMux Official"
    },
    "formSchema": {
      "type": "object",
      "properties": {
        "product_image": {
          "type": "string",
          "title": "商品主图 / 白底图",
          "description": "支持拖拽上传高清商品图，或粘贴电商链接自动解析",
          "widget": "media-uploader",
          "default": "https://cdn.creatify.ai/community_creation/12dca4ee-0535-402c-9f57-f36fd4819157/preview_image_0b102b35.webp"
        },
        "copywriting": {
          "type": "string",
          "title": "核心卖点与旁白分镜",
          "description": "填入 1~3 句核心商品卖点，AI 将自动融合至爆款分镜节奏",
          "widget": "textarea",
          "default": "Bring your porduct to life with movie-quality 3D characters facing relatable daily struggles. Easily fit your product or app into the storyline as the ultimate hero, creating an emotional connection with your audience through heartwarming animation."
        },
        "voice": {
          "type": "string",
          "title": "解说人声音色",
          "description": "选择适合该视频情绪的 AI 配音解说音色",
          "widget": "select-single",
          "default": "zh_female_energetic",
          "options": [
            {
              "label": "活力女声（电商促销爆款）",
              "value": "zh_female_energetic"
            },
            {
              "label": "沉稳男声（数码科技大片）",
              "value": "zh_male_calm"
            },
            {
              "label": "亲和闺蜜（达人开箱真实种草）",
              "value": "zh_female_friendly"
            },
            {
              "label": "磁性男声（高端商业质感）",
              "value": "zh_male_deep"
            }
          ]
        },
        "aspect_ratio": {
          "type": "string",
          "title": "视频成片比例",
          "description": "选择适用的平台播放比例",
          "widget": "ratio-cards",
          "default": "9:16",
          "options": [
            {
              "label": "9:16 竖屏 (TikTok / Shorts)",
              "value": "9:16"
            },
            {
              "label": "16:9 横屏 (YouTube / 官网)",
              "value": "16:9"
            },
            {
              "label": "1:1 方屏 (Instagram / 推广)",
              "value": "1:1"
            }
          ]
        }
      },
      "required": [
        "product_image",
        "copywriting"
      ],
      "additionalProperties": false
    },
    "fieldMappings": {
      "product_image": {
        "nodeId": "node-slot-product-image",
        "targetField": "mediaUrl",
        "mappingType": "media",
        "widget": "media-uploader",
        "required": true,
        "defaultValue": "https://cdn.creatify.ai/community_creation/12dca4ee-0535-402c-9f57-f36fd4819157/preview_image_0b102b35.webp"
      },
      "copywriting": {
        "nodeId": "node-slot-copywriting",
        "targetField": "content",
        "mappingType": "text",
        "widget": "textarea",
        "required": true,
        "defaultValue": "Bring your porduct to life with movie-quality 3D characters facing relatable daily struggles. Easily fit your product or app into the storyline as the ultimate hero, creating an emotional connection with your audience through heartwarming animation."
      },
      "voice": {
        "nodeId": "node-slot-voice-tts",
        "targetField": "params.voice",
        "mappingType": "param",
        "widget": "select-single",
        "required": false,
        "defaultValue": "zh_female_energetic"
      },
      "aspect_ratio": {
        "nodeId": "node-video-generation-core",
        "targetField": "params.aspectRatio",
        "mappingType": "param",
        "widget": "ratio-cards",
        "required": false,
        "defaultValue": "9:16"
      }
    },
    "showcase": {
      "mode": "carousel",
      "items": [
        {
          "id": "showcase-app-creatify-3d-cute-vfx-01",
          "title": "爆款成片效果演示",
          "mediaType": "video",
          "mediaUrl": "https://cdn.creatify.ai/community_creation/12dca4ee-0535-402c-9f57-f36fd4819157/preview_video_e7e71f76_compressed_v2.mp4",
          "posterUrl": "https://cdn.creatify.ai/community_creation/12dca4ee-0535-402c-9f57-f36fd4819157/preview_image_0b102b35.webp"
        }
      ]
    }
  },
  {
    "schemaVersion": "1.0.0",
    "appId": "app-creatify-apparel-tryon",
    "version": "1.0.0",
    "workflowBinding": {
      "workspaceId": "ws-app-creatify-apparel-tryon",
      "workflowVersion": 1
    },
    "metadata": {
      "name": "模特动态走秀穿搭与场景变装",
      "category": "video",
      "description": "专攻服饰鞋包转化：模特街头走秀、多场景无缝换装与面料微距质感",
      "icon": "video",
      "tags": [
        "creatify",
        "fashion-try-on",
        "e-commerce",
        "viral-video"
      ],
      "author": "OmniMux Official"
    },
    "formSchema": {
      "type": "object",
      "properties": {
        "product_image": {
          "type": "string",
          "title": "商品主图 / 白底图",
          "description": "支持拖拽上传高清商品图，或粘贴电商链接自动解析",
          "widget": "media-uploader",
          "default": "https://cdn.creatify.ai/community_creation/9376553d-a10f-444a-99b3-c876de1f6481/preview_image_e825b0ff.webp"
        },
        "copywriting": {
          "type": "string",
          "title": "核心卖点与旁白分镜",
          "description": "填入 1~3 句核心商品卖点，AI 将自动融合至爆款分镜节奏",
          "widget": "textarea",
          "default": "Multiple angle and scene photos of clothing models. Upload your product to experience it."
        },
        "voice": {
          "type": "string",
          "title": "解说人声音色",
          "description": "选择适合该视频情绪的 AI 配音解说音色",
          "widget": "select-single",
          "default": "zh_female_energetic",
          "options": [
            {
              "label": "活力女声（电商促销爆款）",
              "value": "zh_female_energetic"
            },
            {
              "label": "沉稳男声（数码科技大片）",
              "value": "zh_male_calm"
            },
            {
              "label": "亲和闺蜜（达人开箱真实种草）",
              "value": "zh_female_friendly"
            },
            {
              "label": "磁性男声（高端商业质感）",
              "value": "zh_male_deep"
            }
          ]
        },
        "aspect_ratio": {
          "type": "string",
          "title": "视频成片比例",
          "description": "选择适用的平台播放比例",
          "widget": "ratio-cards",
          "default": "9:16",
          "options": [
            {
              "label": "9:16 竖屏 (TikTok / Shorts)",
              "value": "9:16"
            },
            {
              "label": "16:9 横屏 (YouTube / 官网)",
              "value": "16:9"
            },
            {
              "label": "1:1 方屏 (Instagram / 推广)",
              "value": "1:1"
            }
          ]
        }
      },
      "required": [
        "product_image",
        "copywriting"
      ],
      "additionalProperties": false
    },
    "fieldMappings": {
      "product_image": {
        "nodeId": "node-slot-product-image",
        "targetField": "mediaUrl",
        "mappingType": "media",
        "widget": "media-uploader",
        "required": true,
        "defaultValue": "https://cdn.creatify.ai/community_creation/9376553d-a10f-444a-99b3-c876de1f6481/preview_image_e825b0ff.webp"
      },
      "copywriting": {
        "nodeId": "node-slot-copywriting",
        "targetField": "content",
        "mappingType": "text",
        "widget": "textarea",
        "required": true,
        "defaultValue": "Multiple angle and scene photos of clothing models. Upload your product to experience it."
      },
      "voice": {
        "nodeId": "node-slot-voice-tts",
        "targetField": "params.voice",
        "mappingType": "param",
        "widget": "select-single",
        "required": false,
        "defaultValue": "zh_female_energetic"
      },
      "aspect_ratio": {
        "nodeId": "node-video-generation-core",
        "targetField": "params.aspectRatio",
        "mappingType": "param",
        "widget": "ratio-cards",
        "required": false,
        "defaultValue": "9:16"
      }
    },
    "showcase": {
      "mode": "carousel",
      "items": [
        {
          "id": "showcase-app-creatify-apparel-tryon-01",
          "title": "爆款成片效果演示",
          "mediaType": "video",
          "mediaUrl": "https://cdn.creatify.ai/community_creation/9376553d-a10f-444a-99b3-c876de1f6481/preview_video_083e3d55_compressed_v2.mp4",
          "posterUrl": "https://cdn.creatify.ai/community_creation/9376553d-a10f-444a-99b3-c876de1f6481/preview_image_e825b0ff.webp"
        }
      ]
    }
  },
  {
    "schemaVersion": "1.0.0",
    "appId": "app-creatify-product-spotlight",
    "version": "1.0.0",
    "workflowBinding": {
      "workspaceId": "ws-app-creatify-product-spotlight",
      "workflowVersion": 1
    },
    "metadata": {
      "name": "15秒焦点商业大促带货广告",
      "category": "video",
      "description": "电商大促爆款标配：强节奏多镜头分镜、核心卖点连续轰炸与高光特写",
      "icon": "video",
      "tags": [
        "creatify",
        "industry-packs",
        "e-commerce",
        "viral-video"
      ],
      "author": "OmniMux Official"
    },
    "formSchema": {
      "type": "object",
      "properties": {
        "product_image": {
          "type": "string",
          "title": "商品主图 / 白底图",
          "description": "支持拖拽上传高清商品图，或粘贴电商链接自动解析",
          "widget": "media-uploader",
          "default": "https://cdn.creatify.ai/community_creation/741d9f20-5d37-43b7-926b-935ebc9668db/preview_image_3ac2faf7.webp"
        },
        "copywriting": {
          "type": "string",
          "title": "核心卖点与旁白分镜",
          "description": "填入 1~3 句核心商品卖点，AI 将自动融合至爆款分镜节奏",
          "widget": "textarea",
          "default": "A 15-second commercially styled ad with professional dynamic camera work, showcasing your product's selling points. Simply upload product images, input storyline settings, and characters to get a stunning professional-grade ad for your product."
        },
        "voice": {
          "type": "string",
          "title": "解说人声音色",
          "description": "选择适合该视频情绪的 AI 配音解说音色",
          "widget": "select-single",
          "default": "zh_female_energetic",
          "options": [
            {
              "label": "活力女声（电商促销爆款）",
              "value": "zh_female_energetic"
            },
            {
              "label": "沉稳男声（数码科技大片）",
              "value": "zh_male_calm"
            },
            {
              "label": "亲和闺蜜（达人开箱真实种草）",
              "value": "zh_female_friendly"
            },
            {
              "label": "磁性男声（高端商业质感）",
              "value": "zh_male_deep"
            }
          ]
        },
        "aspect_ratio": {
          "type": "string",
          "title": "视频成片比例",
          "description": "选择适用的平台播放比例",
          "widget": "ratio-cards",
          "default": "9:16",
          "options": [
            {
              "label": "9:16 竖屏 (TikTok / Shorts)",
              "value": "9:16"
            },
            {
              "label": "16:9 横屏 (YouTube / 官网)",
              "value": "16:9"
            },
            {
              "label": "1:1 方屏 (Instagram / 推广)",
              "value": "1:1"
            }
          ]
        }
      },
      "required": [
        "product_image",
        "copywriting"
      ],
      "additionalProperties": false
    },
    "fieldMappings": {
      "product_image": {
        "nodeId": "node-slot-product-image",
        "targetField": "mediaUrl",
        "mappingType": "media",
        "widget": "media-uploader",
        "required": true,
        "defaultValue": "https://cdn.creatify.ai/community_creation/741d9f20-5d37-43b7-926b-935ebc9668db/preview_image_3ac2faf7.webp"
      },
      "copywriting": {
        "nodeId": "node-slot-copywriting",
        "targetField": "content",
        "mappingType": "text",
        "widget": "textarea",
        "required": true,
        "defaultValue": "A 15-second commercially styled ad with professional dynamic camera work, showcasing your product's selling points. Simply upload product images, input storyline settings, and characters to get a stunning professional-grade ad for your product."
      },
      "voice": {
        "nodeId": "node-slot-voice-tts",
        "targetField": "params.voice",
        "mappingType": "param",
        "widget": "select-single",
        "required": false,
        "defaultValue": "zh_female_energetic"
      },
      "aspect_ratio": {
        "nodeId": "node-video-generation-core",
        "targetField": "params.aspectRatio",
        "mappingType": "param",
        "widget": "ratio-cards",
        "required": false,
        "defaultValue": "9:16"
      }
    },
    "showcase": {
      "mode": "carousel",
      "items": [
        {
          "id": "showcase-app-creatify-product-spotlight-01",
          "title": "爆款成片效果演示",
          "mediaType": "video",
          "mediaUrl": "https://cdn.creatify.ai/community_creation/741d9f20-5d37-43b7-926b-935ebc9668db/preview_video_07f45334_compressed_v2.mp4",
          "posterUrl": "https://cdn.creatify.ai/community_creation/741d9f20-5d37-43b7-926b-935ebc9668db/preview_image_3ac2faf7.webp"
        }
      ]
    }
  },
  {
    "schemaVersion": "1.0.0",
    "appId": "app-creatify-fall-down-durability",
    "version": "1.0.0",
    "workflowBinding": {
      "workspaceId": "ws-app-creatify-fall-down-durability",
      "workflowVersion": 1
    },
    "metadata": {
      "name": "高空跌落耐用防摔与折扣实测",
      "category": "video",
      "description": "建立极强品质信任：高空跌落耐摔、极限冲击与实拍折扣力度揭晓",
      "icon": "video",
      "tags": [
        "creatify",
        "durability-test",
        "e-commerce",
        "viral-video"
      ],
      "author": "OmniMux Official"
    },
    "formSchema": {
      "type": "object",
      "properties": {
        "product_image": {
          "type": "string",
          "title": "商品主图 / 白底图",
          "description": "支持拖拽上传高清商品图，或粘贴电商链接自动解析",
          "widget": "media-uploader",
          "default": "https://cdn.creatify.ai/community_creation/73b5fb39-bcb1-48bc-a382-6de753fcb740/preview_image_0b2932fe.webp"
        },
        "copywriting": {
          "type": "string",
          "title": "核心卖点与旁白分镜",
          "description": "填入 1~3 句核心商品卖点，AI 将自动融合至爆款分镜节奏",
          "widget": "textarea",
          "default": "A 12-second vertical fashion ad template. Suitable for handheld products.\r\n\r\nAfter a natural collision, the model falls backward as the product and discount poster fly toward the camera for two smooth slow-motion close-ups, then return to real-time for a physically realistic landing. Ideal for promoting your product during sale."
        },
        "voice": {
          "type": "string",
          "title": "解说人声音色",
          "description": "选择适合该视频情绪的 AI 配音解说音色",
          "widget": "select-single",
          "default": "zh_female_energetic",
          "options": [
            {
              "label": "活力女声（电商促销爆款）",
              "value": "zh_female_energetic"
            },
            {
              "label": "沉稳男声（数码科技大片）",
              "value": "zh_male_calm"
            },
            {
              "label": "亲和闺蜜（达人开箱真实种草）",
              "value": "zh_female_friendly"
            },
            {
              "label": "磁性男声（高端商业质感）",
              "value": "zh_male_deep"
            }
          ]
        },
        "aspect_ratio": {
          "type": "string",
          "title": "视频成片比例",
          "description": "选择适用的平台播放比例",
          "widget": "ratio-cards",
          "default": "9:16",
          "options": [
            {
              "label": "9:16 竖屏 (TikTok / Shorts)",
              "value": "9:16"
            },
            {
              "label": "16:9 横屏 (YouTube / 官网)",
              "value": "16:9"
            },
            {
              "label": "1:1 方屏 (Instagram / 推广)",
              "value": "1:1"
            }
          ]
        }
      },
      "required": [
        "product_image",
        "copywriting"
      ],
      "additionalProperties": false
    },
    "fieldMappings": {
      "product_image": {
        "nodeId": "node-slot-product-image",
        "targetField": "mediaUrl",
        "mappingType": "media",
        "widget": "media-uploader",
        "required": true,
        "defaultValue": "https://cdn.creatify.ai/community_creation/73b5fb39-bcb1-48bc-a382-6de753fcb740/preview_image_0b2932fe.webp"
      },
      "copywriting": {
        "nodeId": "node-slot-copywriting",
        "targetField": "content",
        "mappingType": "text",
        "widget": "textarea",
        "required": true,
        "defaultValue": "A 12-second vertical fashion ad template. Suitable for handheld products.\r\n\r\nAfter a natural collision, the model falls backward as the product and discount poster fly toward the camera for two smooth slow-motion close-ups, then return to real-time for a physically realistic landing. Ideal for promoting your product during sale."
      },
      "voice": {
        "nodeId": "node-slot-voice-tts",
        "targetField": "params.voice",
        "mappingType": "param",
        "widget": "select-single",
        "required": false,
        "defaultValue": "zh_female_energetic"
      },
      "aspect_ratio": {
        "nodeId": "node-video-generation-core",
        "targetField": "params.aspectRatio",
        "mappingType": "param",
        "widget": "ratio-cards",
        "required": false,
        "defaultValue": "9:16"
      }
    },
    "showcase": {
      "mode": "carousel",
      "items": [
        {
          "id": "showcase-app-creatify-fall-down-durability-01",
          "title": "爆款成片效果演示",
          "mediaType": "video",
          "mediaUrl": "https://cdn.creatify.ai/community_creation/73b5fb39-bcb1-48bc-a382-6de753fcb740/preview_video_14eb8331_compressed_v2.mp4",
          "posterUrl": "https://cdn.creatify.ai/community_creation/73b5fb39-bcb1-48bc-a382-6de753fcb740/preview_image_0b2932fe.webp"
        }
      ]
    }
  }
]);

export const PRESET_WORKFLOW_SNAPSHOTS: Record<string, any> = Object.freeze({
  "app-creatify-3d-cute-vfx": {
    "schemaVersion": 3,
    "id": "ws-app-creatify-3d-cute-vfx",
    "name": "3D 视效粒子与动态破屏大片",
    "version": 1,
    "nodes": [
      {
        "id": "node-slot-product-image",
        "type": "material",
        "position": {
          "x": 50,
          "y": 100
        },
        "data": {
          "type": "image",
          "tool": "import-image",
          "label": "商品主图槽位 (Product Image)",
          "slotRole": "product_image",
          "isSlot": true,
          "mediaUrl": "https://cdn.creatify.ai/community_creation/12dca4ee-0535-402c-9f57-f36fd4819157/preview_image_0b102b35.webp",
          "params": {
            "aspectRatio": "9:16"
          },
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "image"
        }
      },
      {
        "id": "node-slot-copywriting",
        "type": "material",
        "position": {
          "x": 50,
          "y": 350
        },
        "data": {
          "type": "text",
          "tool": "prompt-template",
          "label": "核心文案槽位 (Copywriting)",
          "slotRole": "copywriting",
          "isSlot": true,
          "content": "Bring your porduct to life with movie-quality 3D characters facing relatable daily struggles. Easily fit your product or app into the storyline as the ultimate hero, creating an emotional connection with your audience through heartwarming animation.",
          "prompt": "Bring your porduct to life with movie-quality 3D characters facing relatable daily struggles. Easily fit your product or app into the storyline as the ultimate hero, creating an emotional connection with your audience through heartwarming animation.",
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "text"
        }
      },
      {
        "id": "node-video-generation-core",
        "type": "material",
        "position": {
          "x": 450,
          "y": 200
        },
        "data": {
          "type": "video",
          "tool": "omnimux_video_submit",
          "label": "3D 视效粒子与动态破屏大片 视频生成内核",
          "model": "seedance-2.0",
          "params": {
            "aspectRatio": "9:16",
            "duration": 5,
            "mode": "first_frame"
          },
          "upstreamBindings": {
            "image": "node-slot-product-image",
            "prompt": "node-slot-copywriting"
          }
        }
      },
      {
        "id": "node-slot-voice-tts",
        "type": "material",
        "position": {
          "x": 450,
          "y": 450
        },
        "data": {
          "type": "audio",
          "tool": "omnimux_audio_submit",
          "label": "旁白解说与音色 (Voice TTS)",
          "slotRole": "voice_tts",
          "isSlot": true,
          "params": {
            "voice": "zh_female_energetic",
            "speed": 1
          },
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "audio"
        }
      }
    ],
    "edges": [
      {
        "id": "edge-img-to-video",
        "source": "node-slot-product-image",
        "target": "node-video-generation-core",
        "targetHandle": "image",
        "label": "商品图输入"
      },
      {
        "id": "edge-text-to-video",
        "source": "node-slot-copywriting",
        "target": "node-video-generation-core",
        "targetHandle": "prompt",
        "label": "分镜文案"
      }
    ],
    "settings": {
      "maxParallel": 2,
      "failStrategy": "fail-fast"
    },
    "metadata": {
      "createdAt": "2026-09-18T04:01:07.923Z",
      "updatedAt": "2026-09-18T04:01:07.923Z",
      "nodeCount": 4,
      "sourceWorkflowId": "12dca4ee-0535-402c-9f57-f36fd4819157"
    }
  },
  "app-creatify-app-demo": {
    "schemaVersion": 3,
    "id": "ws-app-creatify-app-demo",
    "name": "手机与网页交互实机演示",
    "version": 1,
    "nodes": [
      {
        "id": "node-slot-product-image",
        "type": "material",
        "position": {
          "x": 50,
          "y": 100
        },
        "data": {
          "type": "image",
          "tool": "import-image",
          "label": "商品主图槽位 (Product Image)",
          "slotRole": "product_image",
          "isSlot": true,
          "mediaUrl": "https://cdn.creatify.ai/community_creation/f23489b3-2ea5-41bb-9c2c-91d35d71e236/preview_image_35c9be15.webp",
          "params": {
            "aspectRatio": "9:16"
          },
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "image"
        }
      },
      {
        "id": "node-slot-copywriting",
        "type": "material",
        "position": {
          "x": 50,
          "y": 350
        },
        "data": {
          "type": "text",
          "tool": "prompt-template",
          "label": "核心文案槽位 (Copywriting)",
          "slotRole": "copywriting",
          "isSlot": true,
          "content": "Place your laptop screenshot into this engaging UGC video where a friendly young woman sits in a cozy home working space and presents your digital product on her laptop. Horizontal laptop screenshot/ image works the best.",
          "prompt": "Place your laptop screenshot into this engaging UGC video where a friendly young woman sits in a cozy home working space and presents your digital product on her laptop. Horizontal laptop screenshot/ image works the best.",
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "text"
        }
      },
      {
        "id": "node-video-generation-core",
        "type": "material",
        "position": {
          "x": 450,
          "y": 200
        },
        "data": {
          "type": "video",
          "tool": "omnimux_video_submit",
          "label": "手机与网页交互实机演示 视频生成内核",
          "model": "seedance-2.0",
          "params": {
            "aspectRatio": "9:16",
            "duration": 5,
            "mode": "first_frame"
          },
          "upstreamBindings": {
            "image": "node-slot-product-image",
            "prompt": "node-slot-copywriting"
          }
        }
      },
      {
        "id": "node-slot-voice-tts",
        "type": "material",
        "position": {
          "x": 450,
          "y": 450
        },
        "data": {
          "type": "audio",
          "tool": "omnimux_audio_submit",
          "label": "旁白解说与音色 (Voice TTS)",
          "slotRole": "voice_tts",
          "isSlot": true,
          "params": {
            "voice": "zh_female_energetic",
            "speed": 1
          },
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "audio"
        }
      }
    ],
    "edges": [
      {
        "id": "edge-img-to-video",
        "source": "node-slot-product-image",
        "target": "node-video-generation-core",
        "targetHandle": "image",
        "label": "商品图输入"
      },
      {
        "id": "edge-text-to-video",
        "source": "node-slot-copywriting",
        "target": "node-video-generation-core",
        "targetHandle": "prompt",
        "label": "分镜文案"
      }
    ],
    "settings": {
      "maxParallel": 2,
      "failStrategy": "fail-fast"
    },
    "metadata": {
      "createdAt": "2026-09-18T04:01:07.911Z",
      "updatedAt": "2026-09-18T04:01:07.911Z",
      "nodeCount": 4,
      "sourceWorkflowId": "f23489b3-2ea5-41bb-9c2c-91d35d71e236"
    }
  },
  "app-creatify-apparel-tryon": {
    "schemaVersion": 3,
    "id": "ws-app-creatify-apparel-tryon",
    "name": "模特动态走秀穿搭与场景变装",
    "version": 1,
    "nodes": [
      {
        "id": "node-slot-product-image",
        "type": "material",
        "position": {
          "x": 50,
          "y": 100
        },
        "data": {
          "type": "image",
          "tool": "import-image",
          "label": "商品主图槽位 (Product Image)",
          "slotRole": "product_image",
          "isSlot": true,
          "mediaUrl": "https://cdn.creatify.ai/community_creation/9376553d-a10f-444a-99b3-c876de1f6481/preview_image_e825b0ff.webp",
          "params": {
            "aspectRatio": "9:16"
          },
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "image"
        }
      },
      {
        "id": "node-slot-copywriting",
        "type": "material",
        "position": {
          "x": 50,
          "y": 350
        },
        "data": {
          "type": "text",
          "tool": "prompt-template",
          "label": "核心文案槽位 (Copywriting)",
          "slotRole": "copywriting",
          "isSlot": true,
          "content": "Multiple angle and scene photos of clothing models. Upload your product to experience it.",
          "prompt": "Multiple angle and scene photos of clothing models. Upload your product to experience it.",
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "text"
        }
      },
      {
        "id": "node-video-generation-core",
        "type": "material",
        "position": {
          "x": 450,
          "y": 200
        },
        "data": {
          "type": "video",
          "tool": "omnimux_video_submit",
          "label": "模特动态走秀穿搭与场景变装 视频生成内核",
          "model": "seedance-2.0",
          "params": {
            "aspectRatio": "9:16",
            "duration": 5,
            "mode": "first_frame"
          },
          "upstreamBindings": {
            "image": "node-slot-product-image",
            "prompt": "node-slot-copywriting"
          }
        }
      },
      {
        "id": "node-slot-voice-tts",
        "type": "material",
        "position": {
          "x": 450,
          "y": 450
        },
        "data": {
          "type": "audio",
          "tool": "omnimux_audio_submit",
          "label": "旁白解说与音色 (Voice TTS)",
          "slotRole": "voice_tts",
          "isSlot": true,
          "params": {
            "voice": "zh_female_energetic",
            "speed": 1
          },
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "audio"
        }
      }
    ],
    "edges": [
      {
        "id": "edge-img-to-video",
        "source": "node-slot-product-image",
        "target": "node-video-generation-core",
        "targetHandle": "image",
        "label": "商品图输入"
      },
      {
        "id": "edge-text-to-video",
        "source": "node-slot-copywriting",
        "target": "node-video-generation-core",
        "targetHandle": "prompt",
        "label": "分镜文案"
      }
    ],
    "settings": {
      "maxParallel": 2,
      "failStrategy": "fail-fast"
    },
    "metadata": {
      "createdAt": "2026-09-18T04:01:07.925Z",
      "updatedAt": "2026-09-18T04:01:07.925Z",
      "nodeCount": 4,
      "sourceWorkflowId": "9376553d-a10f-444a-99b3-c876de1f6481"
    }
  },
  "app-creatify-chasing-product": {
    "schemaVersion": 3,
    "id": "ws-app-creatify-chasing-product",
    "name": "巨型商品撞屏与荒诞追逐",
    "version": 1,
    "nodes": [
      {
        "id": "node-slot-product-image",
        "type": "material",
        "position": {
          "x": 50,
          "y": 100
        },
        "data": {
          "type": "image",
          "tool": "import-image",
          "label": "商品主图槽位 (Product Image)",
          "slotRole": "product_image",
          "isSlot": true,
          "mediaUrl": "https://cdn.creatify.ai/community_creation/dc1c50e1-f8cd-4120-a772-5a34730aeea4/preview_image_e97194d0.webp",
          "params": {
            "aspectRatio": "9:16"
          },
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "image"
        }
      },
      {
        "id": "node-slot-copywriting",
        "type": "material",
        "position": {
          "x": 50,
          "y": 350
        },
        "data": {
          "type": "text",
          "tool": "prompt-template",
          "label": "核心文案槽位 (Copywriting)",
          "slotRole": "copywriting",
          "isSlot": true,
          "content": "Showcase your product being desperately chased by a group of adult with intense craving energy. This creates a powerful “everyone wants this” vibe that instantly triggers desire and FOMO. Perfect for most handheld products.",
          "prompt": "Showcase your product being desperately chased by a group of adult with intense craving energy. This creates a powerful “everyone wants this” vibe that instantly triggers desire and FOMO. Perfect for most handheld products.",
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "text"
        }
      },
      {
        "id": "node-video-generation-core",
        "type": "material",
        "position": {
          "x": 450,
          "y": 200
        },
        "data": {
          "type": "video",
          "tool": "omnimux_video_submit",
          "label": "巨型商品撞屏与荒诞追逐 视频生成内核",
          "model": "seedance-2.0",
          "params": {
            "aspectRatio": "9:16",
            "duration": 5,
            "mode": "first_frame"
          },
          "upstreamBindings": {
            "image": "node-slot-product-image",
            "prompt": "node-slot-copywriting"
          }
        }
      },
      {
        "id": "node-slot-voice-tts",
        "type": "material",
        "position": {
          "x": 450,
          "y": 450
        },
        "data": {
          "type": "audio",
          "tool": "omnimux_audio_submit",
          "label": "旁白解说与音色 (Voice TTS)",
          "slotRole": "voice_tts",
          "isSlot": true,
          "params": {
            "voice": "zh_female_energetic",
            "speed": 1
          },
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "audio"
        }
      }
    ],
    "edges": [
      {
        "id": "edge-img-to-video",
        "source": "node-slot-product-image",
        "target": "node-video-generation-core",
        "targetHandle": "image",
        "label": "商品图输入"
      },
      {
        "id": "edge-text-to-video",
        "source": "node-slot-copywriting",
        "target": "node-video-generation-core",
        "targetHandle": "prompt",
        "label": "分镜文案"
      }
    ],
    "settings": {
      "maxParallel": 2,
      "failStrategy": "fail-fast"
    },
    "metadata": {
      "createdAt": "2026-09-18T04:01:07.914Z",
      "updatedAt": "2026-09-18T04:01:07.914Z",
      "nodeCount": 4,
      "sourceWorkflowId": "dc1c50e1-f8cd-4120-a772-5a34730aeea4"
    }
  },
  "app-creatify-fall-down-durability": {
    "schemaVersion": 3,
    "id": "ws-app-creatify-fall-down-durability",
    "name": "高空跌落耐用防摔与折扣实测",
    "version": 1,
    "nodes": [
      {
        "id": "node-slot-product-image",
        "type": "material",
        "position": {
          "x": 50,
          "y": 100
        },
        "data": {
          "type": "image",
          "tool": "import-image",
          "label": "商品主图槽位 (Product Image)",
          "slotRole": "product_image",
          "isSlot": true,
          "mediaUrl": "https://cdn.creatify.ai/community_creation/73b5fb39-bcb1-48bc-a382-6de753fcb740/preview_image_0b2932fe.webp",
          "params": {
            "aspectRatio": "9:16"
          },
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "image"
        }
      },
      {
        "id": "node-slot-copywriting",
        "type": "material",
        "position": {
          "x": 50,
          "y": 350
        },
        "data": {
          "type": "text",
          "tool": "prompt-template",
          "label": "核心文案槽位 (Copywriting)",
          "slotRole": "copywriting",
          "isSlot": true,
          "content": "A 12-second vertical fashion ad template. Suitable for handheld products.\r\n\r\nAfter a natural collision, the model falls backward as the product and discount poster fly toward the camera for two smooth slow-motion close-ups, then return to real-time for a physically realistic landing. Ideal for promoting your product during sale.",
          "prompt": "A 12-second vertical fashion ad template. Suitable for handheld products.\r\n\r\nAfter a natural collision, the model falls backward as the product and discount poster fly toward the camera for two smooth slow-motion close-ups, then return to real-time for a physically realistic landing. Ideal for promoting your product during sale.",
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "text"
        }
      },
      {
        "id": "node-video-generation-core",
        "type": "material",
        "position": {
          "x": 450,
          "y": 200
        },
        "data": {
          "type": "video",
          "tool": "omnimux_video_submit",
          "label": "高空跌落耐用防摔与折扣实测 视频生成内核",
          "model": "seedance-2.0",
          "params": {
            "aspectRatio": "9:16",
            "duration": 5,
            "mode": "first_frame"
          },
          "upstreamBindings": {
            "image": "node-slot-product-image",
            "prompt": "node-slot-copywriting"
          }
        }
      },
      {
        "id": "node-slot-voice-tts",
        "type": "material",
        "position": {
          "x": 450,
          "y": 450
        },
        "data": {
          "type": "audio",
          "tool": "omnimux_audio_submit",
          "label": "旁白解说与音色 (Voice TTS)",
          "slotRole": "voice_tts",
          "isSlot": true,
          "params": {
            "voice": "zh_female_energetic",
            "speed": 1
          },
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "audio"
        }
      }
    ],
    "edges": [
      {
        "id": "edge-img-to-video",
        "source": "node-slot-product-image",
        "target": "node-video-generation-core",
        "targetHandle": "image",
        "label": "商品图输入"
      },
      {
        "id": "edge-text-to-video",
        "source": "node-slot-copywriting",
        "target": "node-video-generation-core",
        "targetHandle": "prompt",
        "label": "分镜文案"
      }
    ],
    "settings": {
      "maxParallel": 2,
      "failStrategy": "fail-fast"
    },
    "metadata": {
      "createdAt": "2026-09-18T04:01:07.929Z",
      "updatedAt": "2026-09-18T04:01:07.930Z",
      "nodeCount": 4,
      "sourceWorkflowId": "73b5fb39-bcb1-48bc-a382-6de753fcb740"
    }
  },
  "app-creatify-product-spotlight": {
    "schemaVersion": 3,
    "id": "ws-app-creatify-product-spotlight",
    "name": "15秒焦点商业大促带货广告",
    "version": 1,
    "nodes": [
      {
        "id": "node-slot-product-image",
        "type": "material",
        "position": {
          "x": 50,
          "y": 100
        },
        "data": {
          "type": "image",
          "tool": "import-image",
          "label": "商品主图槽位 (Product Image)",
          "slotRole": "product_image",
          "isSlot": true,
          "mediaUrl": "https://cdn.creatify.ai/community_creation/741d9f20-5d37-43b7-926b-935ebc9668db/preview_image_3ac2faf7.webp",
          "params": {
            "aspectRatio": "9:16"
          },
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "image"
        }
      },
      {
        "id": "node-slot-copywriting",
        "type": "material",
        "position": {
          "x": 50,
          "y": 350
        },
        "data": {
          "type": "text",
          "tool": "prompt-template",
          "label": "核心文案槽位 (Copywriting)",
          "slotRole": "copywriting",
          "isSlot": true,
          "content": "A 15-second commercially styled ad with professional dynamic camera work, showcasing your product's selling points. Simply upload product images, input storyline settings, and characters to get a stunning professional-grade ad for your product.",
          "prompt": "A 15-second commercially styled ad with professional dynamic camera work, showcasing your product's selling points. Simply upload product images, input storyline settings, and characters to get a stunning professional-grade ad for your product.",
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "text"
        }
      },
      {
        "id": "node-video-generation-core",
        "type": "material",
        "position": {
          "x": 450,
          "y": 200
        },
        "data": {
          "type": "video",
          "tool": "omnimux_video_submit",
          "label": "15秒焦点商业大促带货广告 视频生成内核",
          "model": "seedance-2.0",
          "params": {
            "aspectRatio": "9:16",
            "duration": 5,
            "mode": "first_frame"
          },
          "upstreamBindings": {
            "image": "node-slot-product-image",
            "prompt": "node-slot-copywriting"
          }
        }
      },
      {
        "id": "node-slot-voice-tts",
        "type": "material",
        "position": {
          "x": 450,
          "y": 450
        },
        "data": {
          "type": "audio",
          "tool": "omnimux_audio_submit",
          "label": "旁白解说与音色 (Voice TTS)",
          "slotRole": "voice_tts",
          "isSlot": true,
          "params": {
            "voice": "zh_female_energetic",
            "speed": 1
          },
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "audio"
        }
      }
    ],
    "edges": [
      {
        "id": "edge-img-to-video",
        "source": "node-slot-product-image",
        "target": "node-video-generation-core",
        "targetHandle": "image",
        "label": "商品图输入"
      },
      {
        "id": "edge-text-to-video",
        "source": "node-slot-copywriting",
        "target": "node-video-generation-core",
        "targetHandle": "prompt",
        "label": "分镜文案"
      }
    ],
    "settings": {
      "maxParallel": 2,
      "failStrategy": "fail-fast"
    },
    "metadata": {
      "createdAt": "2026-09-18T04:01:07.926Z",
      "updatedAt": "2026-09-18T04:01:07.926Z",
      "nodeCount": 4,
      "sourceWorkflowId": "741d9f20-5d37-43b7-926b-935ebc9668db"
    }
  },
  "app-creatify-ugc-selfie": {
    "schemaVersion": 3,
    "id": "ws-app-creatify-ugc-selfie",
    "name": "海外达人自拍第一视角口播评测",
    "version": 1,
    "nodes": [
      {
        "id": "node-slot-product-image",
        "type": "material",
        "position": {
          "x": 50,
          "y": 100
        },
        "data": {
          "type": "image",
          "tool": "import-image",
          "label": "商品主图槽位 (Product Image)",
          "slotRole": "product_image",
          "isSlot": true,
          "mediaUrl": "https://cdn.creatify.ai/community_creation/decc9021-4f2a-4d0c-8493-df845635716d/preview_image_d7f74acc.webp",
          "params": {
            "aspectRatio": "9:16"
          },
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "image"
        }
      },
      {
        "id": "node-slot-copywriting",
        "type": "material",
        "position": {
          "x": 50,
          "y": 350
        },
        "data": {
          "type": "text",
          "tool": "prompt-template",
          "label": "核心文案槽位 (Copywriting)",
          "slotRole": "copywriting",
          "isSlot": true,
          "content": "A 20s video with casual, authentic UGC yapping style—friendly, natural, and relatable. Alternating front-facing selfie clips with product close-ups. Simply input info to try it out.",
          "prompt": "A 20s video with casual, authentic UGC yapping style—friendly, natural, and relatable. Alternating front-facing selfie clips with product close-ups. Simply input info to try it out.",
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "text"
        }
      },
      {
        "id": "node-video-generation-core",
        "type": "material",
        "position": {
          "x": 450,
          "y": 200
        },
        "data": {
          "type": "video",
          "tool": "omnimux_video_submit",
          "label": "海外达人自拍第一视角口播评测 视频生成内核",
          "model": "seedance-2.0",
          "params": {
            "aspectRatio": "9:16",
            "duration": 5,
            "mode": "first_frame"
          },
          "upstreamBindings": {
            "image": "node-slot-product-image",
            "prompt": "node-slot-copywriting"
          }
        }
      },
      {
        "id": "node-slot-voice-tts",
        "type": "material",
        "position": {
          "x": 450,
          "y": 450
        },
        "data": {
          "type": "audio",
          "tool": "omnimux_audio_submit",
          "label": "旁白解说与音色 (Voice TTS)",
          "slotRole": "voice_tts",
          "isSlot": true,
          "params": {
            "voice": "zh_female_energetic",
            "speed": 1
          },
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "audio"
        }
      }
    ],
    "edges": [
      {
        "id": "edge-img-to-video",
        "source": "node-slot-product-image",
        "target": "node-video-generation-core",
        "targetHandle": "image",
        "label": "商品图输入"
      },
      {
        "id": "edge-text-to-video",
        "source": "node-slot-copywriting",
        "target": "node-video-generation-core",
        "targetHandle": "prompt",
        "label": "分镜文案"
      }
    ],
    "settings": {
      "maxParallel": 2,
      "failStrategy": "fail-fast"
    },
    "metadata": {
      "createdAt": "2026-09-18T04:01:07.919Z",
      "updatedAt": "2026-09-18T04:01:07.919Z",
      "nodeCount": 4,
      "sourceWorkflowId": "decc9021-4f2a-4d0c-8493-df845635716d"
    }
  }
});
