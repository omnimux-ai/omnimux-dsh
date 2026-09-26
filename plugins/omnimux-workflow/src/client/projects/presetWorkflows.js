/**
 * 内置预置应用工作流拓扑字典。
 * 当克隆/创建官方预置应用的工程副本时，由此注入真实节点与连线。
 */
export const PRESET_WORKFLOW_MAP = {
  "app-builtin-product-video": {
    "name": "商品生视频",
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
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "image"
        }
      },
      {
        "id": "node-slot-custom-brief",
        "type": "material",
        "position": {
          "x": 50,
          "y": 350
        },
        "data": {
          "type": "text",
          "tool": "prompt-template",
          "label": "自定义描述槽位 (Custom Brief)",
          "slotRole": "custom_brief",
          "isSlot": true,
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "text"
        }
      },
      {
        "id": "node-slot-product-link",
        "type": "material",
        "position": {
          "x": 50,
          "y": 500
        },
        "data": {
          "type": "text",
          "tool": "prompt-template",
          "label": "商品链接槽位 (Product Link)",
          "slotRole": "product_link",
          "isSlot": true,
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
          "materialType": "video",
          "nodeKind": "generate",
          "selectedTool": "omnimux_video_submit",
          "tool": "omnimux_video_submit",
          "label": "商品生视频 视频生成内核",
          "model": "seedance-2.0",
          "params": {
            "model": "seedance-2.0",
            "aspectRatio": "9:16",
            "duration": 5,
            "mode": "first_frame",
            "contentMode": "preset",
            "presetType": "ugc",
            "platforms": [
              "TikTok"
            ]
          },
          "upstreamBindings": {
            "image": "node-slot-product-image",
            "prompt": "node-slot-custom-brief"
          }
        }
      }
    ],
    "edges": [
      {
        "id": "edge-img-to-video",
        "source": "node-slot-product-image",
        "sourceHandle": "out",
        "target": "node-video-generation-core",
        "targetHandle": "in",
        "label": "商品图输入",
        "data": {
          "targetSlot": "first_frame"
        }
      },
      {
        "id": "edge-text-to-video",
        "source": "node-slot-custom-brief",
        "sourceHandle": "out",
        "target": "node-video-generation-core",
        "targetHandle": "in",
        "label": "自定义描述"
      }
    ]
  },
  "app-builtin-video-to-prompt": {
    "name": "视频转提示词",
    "nodes": [
      {
        "id": "node-slot-source-video",
        "type": "material",
        "position": {
          "x": 50,
          "y": 100
        },
        "data": {
          "type": "video",
          "tool": "import-video",
          "label": "视频链接槽位 (Source Video)",
          "slotRole": "source_video",
          "isSlot": true,
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "video"
        }
      },
      {
        "id": "node-prompt-analysis-core",
        "type": "material",
        "position": {
          "x": 450,
          "y": 200
        },
        "data": {
          "type": "text",
          "materialType": "text",
          "nodeKind": "generate",
          "selectedTool": "text-to-text",
          "tool": "text-to-text",
          "label": "视频转提示词 提示词拆解内核",
          "model": "gemini-3.8-flash",
          "params": {
            "model": "gemini-3.8-flash",
            "analysisFocus": [
              "hook",
              "pacing"
            ],
            "promptLanguage": "zh"
          },
          "upstreamBindings": {
            "prompt": "node-slot-source-video"
          }
        }
      }
    ],
    "edges": [
      {
        "id": "edge-video-to-analysis",
        "source": "node-slot-source-video",
        "sourceHandle": "out",
        "target": "node-prompt-analysis-core",
        "targetHandle": "in",
        "label": "视频输入"
      }
    ]
  },
  "app-builtin-viral-replication": {
    "name": "爆款复刻",
    "nodes": [
      {
        "id": "node-slot-reference-video",
        "type": "material",
        "position": {
          "x": 50,
          "y": 100
        },
        "data": {
          "type": "video",
          "tool": "import-video",
          "label": "参考视频槽位 (Reference Video)",
          "slotRole": "reference_video",
          "isSlot": true,
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "video"
        }
      },
      {
        "id": "node-slot-reference-inspiration",
        "type": "material",
        "position": {
          "x": 50,
          "y": 300
        },
        "data": {
          "type": "video",
          "tool": "import-video",
          "label": "参考灵感槽位 (Reference Inspiration)",
          "slotRole": "reference_inspiration",
          "isSlot": true,
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "materialType": "video"
        }
      },
      {
        "id": "node-slot-rewrite-intent",
        "type": "material",
        "position": {
          "x": 50,
          "y": 500
        },
        "data": {
          "type": "text",
          "tool": "prompt-template",
          "label": "改写意图槽位 (Rewrite Intent)",
          "slotRole": "rewrite_intent",
          "isSlot": true,
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
          "materialType": "video",
          "nodeKind": "generate",
          "selectedTool": "omnimux_video_submit",
          "tool": "omnimux_video_submit",
          "label": "爆款复刻 视频生成内核",
          "model": "seedance-2.0",
          "params": {
            "model": "seedance-2.0",
            "aspectRatio": "9:16",
            "duration": 5,
            "platforms": [
              "TikTok"
            ]
          },
          "upstreamBindings": {
            "video": "node-slot-reference-video",
            "prompt": "node-slot-rewrite-intent"
          }
        }
      }
    ],
    "edges": [
      {
        "id": "edge-ref-to-video",
        "source": "node-slot-reference-video",
        "sourceHandle": "out",
        "target": "node-video-generation-core",
        "targetHandle": "in",
        "label": "参考视频"
      },
      {
        "id": "edge-intent-to-video",
        "source": "node-slot-rewrite-intent",
        "sourceHandle": "out",
        "target": "node-video-generation-core",
        "targetHandle": "in",
        "label": "改写意图"
      }
    ]
  },
  "app-creatify-3d-cute-vfx": {
    "name": "3D 视效粒子与动态破屏大片",
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
          "materialType": "image",
          "tool": "import-image",
          "label": "商品主图槽位 (Product Image)",
          "slotRole": "product_image",
          "isSlot": true,
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "mediaUrl": "https://cdn.creatify.ai/community_creation/12dca4ee-0535-402c-9f57-f36fd4819157/preview_image_0b102b35.webp",
          "params": {
            "aspectRatio": "9:16"
          }
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
          "materialType": "text",
          "tool": "prompt-template",
          "label": "核心文案槽位 (Copywriting)",
          "slotRole": "copywriting",
          "isSlot": true,
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "content": "Bring your porduct to life with movie-quality 3D characters facing relatable daily struggles. Easily fit your product or app into the storyline as the ultimate hero, creating an emotional connection with your audience through heartwarming animation.",
          "prompt": "Bring your porduct to life with movie-quality 3D characters facing relatable daily struggles. Easily fit your product or app into the storyline as the ultimate hero, creating an emotional connection with your audience through heartwarming animation."
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
          "materialType": "video",
          "nodeKind": "generate",
          "selectedTool": "omnimux_video_submit",
          "tool": "omnimux_video_submit",
          "label": "3D 视效粒子与动态破屏大片 视频生成内核",
          "model": "seedance-2.0",
          "params": {
            "model": "seedance-2.0",
            "aspectRatio": "9:16",
            "duration": 5,
            "mode": "first_frame"
          },
          "upstreamBindings": {
            "image": "node-slot-product-image",
            "prompt": "node-slot-copywriting"
          }
        }
      }
    ],
    "edges": [
      {
        "id": "edge-img-to-video",
        "source": "node-slot-product-image",
        "sourceHandle": "out",
        "target": "node-video-generation-core",
        "targetHandle": "in",
        "label": "商品图输入",
        "data": {
          "targetSlot": "first_frame"
        }
      },
      {
        "id": "edge-text-to-video",
        "source": "node-slot-copywriting",
        "sourceHandle": "out",
        "target": "node-video-generation-core",
        "targetHandle": "in",
        "label": "分镜文案"
      }
    ]
  },
  "app-creatify-app-demo": {
    "name": "手机与网页交互实机演示",
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
          "materialType": "image",
          "tool": "import-image",
          "label": "商品主图槽位 (Product Image)",
          "slotRole": "product_image",
          "isSlot": true,
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "mediaUrl": "https://cdn.creatify.ai/community_creation/f23489b3-2ea5-41bb-9c2c-91d35d71e236/preview_image_35c9be15.webp",
          "params": {
            "aspectRatio": "9:16"
          }
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
          "materialType": "text",
          "tool": "prompt-template",
          "label": "核心文案槽位 (Copywriting)",
          "slotRole": "copywriting",
          "isSlot": true,
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "content": "Place your laptop screenshot into this engaging UGC video where a friendly young woman sits in a cozy home working space and presents your digital product on her laptop. Horizontal laptop screenshot/ image works the best.",
          "prompt": "Place your laptop screenshot into this engaging UGC video where a friendly young woman sits in a cozy home working space and presents your digital product on her laptop. Horizontal laptop screenshot/ image works the best."
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
          "materialType": "video",
          "nodeKind": "generate",
          "selectedTool": "omnimux_video_submit",
          "tool": "omnimux_video_submit",
          "label": "手机与网页交互实机演示 视频生成内核",
          "model": "seedance-2.0",
          "params": {
            "model": "seedance-2.0",
            "aspectRatio": "9:16",
            "duration": 5,
            "mode": "first_frame"
          },
          "upstreamBindings": {
            "image": "node-slot-product-image",
            "prompt": "node-slot-copywriting"
          }
        }
      }
    ],
    "edges": [
      {
        "id": "edge-img-to-video",
        "source": "node-slot-product-image",
        "sourceHandle": "out",
        "target": "node-video-generation-core",
        "targetHandle": "in",
        "label": "商品图输入",
        "data": {
          "targetSlot": "first_frame"
        }
      },
      {
        "id": "edge-text-to-video",
        "source": "node-slot-copywriting",
        "sourceHandle": "out",
        "target": "node-video-generation-core",
        "targetHandle": "in",
        "label": "分镜文案"
      }
    ]
  },
  "app-creatify-apparel-tryon": {
    "name": "模特动态走秀穿搭与场景变装",
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
          "materialType": "image",
          "tool": "import-image",
          "label": "商品主图槽位 (Product Image)",
          "slotRole": "product_image",
          "isSlot": true,
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "mediaUrl": "https://cdn.creatify.ai/community_creation/9376553d-a10f-444a-99b3-c876de1f6481/preview_image_e825b0ff.webp",
          "params": {
            "aspectRatio": "9:16"
          }
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
          "materialType": "text",
          "tool": "prompt-template",
          "label": "核心文案槽位 (Copywriting)",
          "slotRole": "copywriting",
          "isSlot": true,
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "content": "Multiple angle and scene photos of clothing models. Upload your product to experience it.",
          "prompt": "Multiple angle and scene photos of clothing models. Upload your product to experience it."
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
          "materialType": "video",
          "nodeKind": "generate",
          "selectedTool": "omnimux_video_submit",
          "tool": "omnimux_video_submit",
          "label": "模特动态走秀穿搭与场景变装 视频生成内核",
          "model": "seedance-2.0",
          "params": {
            "model": "seedance-2.0",
            "aspectRatio": "9:16",
            "duration": 5,
            "mode": "first_frame"
          },
          "upstreamBindings": {
            "image": "node-slot-product-image",
            "prompt": "node-slot-copywriting"
          }
        }
      }
    ],
    "edges": [
      {
        "id": "edge-img-to-video",
        "source": "node-slot-product-image",
        "sourceHandle": "out",
        "target": "node-video-generation-core",
        "targetHandle": "in",
        "label": "商品图输入",
        "data": {
          "targetSlot": "first_frame"
        }
      },
      {
        "id": "edge-text-to-video",
        "source": "node-slot-copywriting",
        "sourceHandle": "out",
        "target": "node-video-generation-core",
        "targetHandle": "in",
        "label": "分镜文案"
      }
    ]
  },
  "app-creatify-chasing-product": {
    "name": "巨型商品撞屏与荒诞追逐",
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
          "materialType": "image",
          "tool": "import-image",
          "label": "商品主图槽位 (Product Image)",
          "slotRole": "product_image",
          "isSlot": true,
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "mediaUrl": "https://cdn.creatify.ai/community_creation/dc1c50e1-f8cd-4120-a772-5a34730aeea4/preview_image_e97194d0.webp",
          "params": {
            "aspectRatio": "9:16"
          }
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
          "materialType": "text",
          "tool": "prompt-template",
          "label": "核心文案槽位 (Copywriting)",
          "slotRole": "copywriting",
          "isSlot": true,
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "content": "Showcase your product being desperately chased by a group of adult with intense craving energy. This creates a powerful “everyone wants this” vibe that instantly triggers desire and FOMO. Perfect for most handheld products.",
          "prompt": "Showcase your product being desperately chased by a group of adult with intense craving energy. This creates a powerful “everyone wants this” vibe that instantly triggers desire and FOMO. Perfect for most handheld products."
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
          "materialType": "video",
          "nodeKind": "generate",
          "selectedTool": "omnimux_video_submit",
          "tool": "omnimux_video_submit",
          "label": "巨型商品撞屏与荒诞追逐 视频生成内核",
          "model": "seedance-2.0",
          "params": {
            "model": "seedance-2.0",
            "aspectRatio": "9:16",
            "duration": 5,
            "mode": "first_frame"
          },
          "upstreamBindings": {
            "image": "node-slot-product-image",
            "prompt": "node-slot-copywriting"
          }
        }
      }
    ],
    "edges": [
      {
        "id": "edge-img-to-video",
        "source": "node-slot-product-image",
        "sourceHandle": "out",
        "target": "node-video-generation-core",
        "targetHandle": "in",
        "label": "商品图输入",
        "data": {
          "targetSlot": "first_frame"
        }
      },
      {
        "id": "edge-text-to-video",
        "source": "node-slot-copywriting",
        "sourceHandle": "out",
        "target": "node-video-generation-core",
        "targetHandle": "in",
        "label": "分镜文案"
      }
    ]
  },
  "app-creatify-fall-down-durability": {
    "name": "高空跌落耐用防摔与折扣实测",
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
          "materialType": "image",
          "tool": "import-image",
          "label": "商品主图槽位 (Product Image)",
          "slotRole": "product_image",
          "isSlot": true,
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "mediaUrl": "https://cdn.creatify.ai/community_creation/73b5fb39-bcb1-48bc-a382-6de753fcb740/preview_image_0b2932fe.webp",
          "params": {
            "aspectRatio": "9:16"
          }
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
          "materialType": "text",
          "tool": "prompt-template",
          "label": "核心文案槽位 (Copywriting)",
          "slotRole": "copywriting",
          "isSlot": true,
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "content": "A 12-second vertical fashion ad template. Suitable for handheld products.\r\n\r\nAfter a natural collision, the model falls backward as the product and discount poster fly toward the camera for two smooth slow-motion close-ups, then return to real-time for a physically realistic landing. Ideal for promoting your product during sale.",
          "prompt": "A 12-second vertical fashion ad template. Suitable for handheld products.\r\n\r\nAfter a natural collision, the model falls backward as the product and discount poster fly toward the camera for two smooth slow-motion close-ups, then return to real-time for a physically realistic landing. Ideal for promoting your product during sale."
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
          "materialType": "video",
          "nodeKind": "generate",
          "selectedTool": "omnimux_video_submit",
          "tool": "omnimux_video_submit",
          "label": "高空跌落耐用防摔与折扣实测 视频生成内核",
          "model": "seedance-2.0",
          "params": {
            "model": "seedance-2.0",
            "aspectRatio": "9:16",
            "duration": 5,
            "mode": "first_frame"
          },
          "upstreamBindings": {
            "image": "node-slot-product-image",
            "prompt": "node-slot-copywriting"
          }
        }
      }
    ],
    "edges": [
      {
        "id": "edge-img-to-video",
        "source": "node-slot-product-image",
        "sourceHandle": "out",
        "target": "node-video-generation-core",
        "targetHandle": "in",
        "label": "商品图输入",
        "data": {
          "targetSlot": "first_frame"
        }
      },
      {
        "id": "edge-text-to-video",
        "source": "node-slot-copywriting",
        "sourceHandle": "out",
        "target": "node-video-generation-core",
        "targetHandle": "in",
        "label": "分镜文案"
      }
    ]
  },
  "app-creatify-product-spotlight": {
    "name": "15秒焦点商业大促带货广告",
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
          "materialType": "image",
          "tool": "import-image",
          "label": "商品主图槽位 (Product Image)",
          "slotRole": "product_image",
          "isSlot": true,
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "mediaUrl": "https://cdn.creatify.ai/community_creation/741d9f20-5d37-43b7-926b-935ebc9668db/preview_image_3ac2faf7.webp",
          "params": {
            "aspectRatio": "9:16"
          }
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
          "materialType": "text",
          "tool": "prompt-template",
          "label": "核心文案槽位 (Copywriting)",
          "slotRole": "copywriting",
          "isSlot": true,
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "content": "A 15-second commercially styled ad with professional dynamic camera work, showcasing your product's selling points. Simply upload product images, input storyline settings, and characters to get a stunning professional-grade ad for your product.",
          "prompt": "A 15-second commercially styled ad with professional dynamic camera work, showcasing your product's selling points. Simply upload product images, input storyline settings, and characters to get a stunning professional-grade ad for your product."
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
          "materialType": "video",
          "nodeKind": "generate",
          "selectedTool": "omnimux_video_submit",
          "tool": "omnimux_video_submit",
          "label": "15秒焦点商业大促带货广告 视频生成内核",
          "model": "seedance-2.0",
          "params": {
            "model": "seedance-2.0",
            "aspectRatio": "9:16",
            "duration": 5,
            "mode": "first_frame"
          },
          "upstreamBindings": {
            "image": "node-slot-product-image",
            "prompt": "node-slot-copywriting"
          }
        }
      }
    ],
    "edges": [
      {
        "id": "edge-img-to-video",
        "source": "node-slot-product-image",
        "sourceHandle": "out",
        "target": "node-video-generation-core",
        "targetHandle": "in",
        "label": "商品图输入",
        "data": {
          "targetSlot": "first_frame"
        }
      },
      {
        "id": "edge-text-to-video",
        "source": "node-slot-copywriting",
        "sourceHandle": "out",
        "target": "node-video-generation-core",
        "targetHandle": "in",
        "label": "分镜文案"
      }
    ]
  },
  "app-creatify-ugc-selfie": {
    "name": "海外达人自拍第一视角口播评测",
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
          "materialType": "image",
          "tool": "import-image",
          "label": "商品主图槽位 (Product Image)",
          "slotRole": "product_image",
          "isSlot": true,
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "mediaUrl": "https://cdn.creatify.ai/community_creation/decc9021-4f2a-4d0c-8493-df845635716d/preview_image_d7f74acc.webp",
          "params": {
            "aspectRatio": "9:16"
          }
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
          "materialType": "text",
          "tool": "prompt-template",
          "label": "核心文案槽位 (Copywriting)",
          "slotRole": "copywriting",
          "isSlot": true,
          "nodeKind": "import",
          "selectedTool": "import",
          "status": "completed",
          "content": "A 20s video with casual, authentic UGC yapping style—friendly, natural, and relatable. Alternating front-facing selfie clips with product close-ups. Simply input info to try it out.",
          "prompt": "A 20s video with casual, authentic UGC yapping style—friendly, natural, and relatable. Alternating front-facing selfie clips with product close-ups. Simply input info to try it out."
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
          "materialType": "video",
          "nodeKind": "generate",
          "selectedTool": "omnimux_video_submit",
          "tool": "omnimux_video_submit",
          "label": "海外达人自拍第一视角口播评测 视频生成内核",
          "model": "seedance-2.0",
          "params": {
            "model": "seedance-2.0",
            "aspectRatio": "9:16",
            "duration": 5,
            "mode": "first_frame"
          },
          "upstreamBindings": {
            "image": "node-slot-product-image",
            "prompt": "node-slot-copywriting"
          }
        }
      }
    ],
    "edges": [
      {
        "id": "edge-img-to-video",
        "source": "node-slot-product-image",
        "sourceHandle": "out",
        "target": "node-video-generation-core",
        "targetHandle": "in",
        "label": "商品图输入",
        "data": {
          "targetSlot": "first_frame"
        }
      },
      {
        "id": "edge-text-to-video",
        "source": "node-slot-copywriting",
        "sourceHandle": "out",
        "target": "node-video-generation-core",
        "targetHandle": "in",
        "label": "分镜文案"
      }
    ]
  }
};
