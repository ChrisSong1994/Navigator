#!/usr/bin/env node
/**
 * Bing 壁纸解析冒烟测试：不访问网络，也不依赖浏览器环境。
 */
import assert from 'node:assert/strict'
import { parseBingWallpapers } from '../src/wallpaper/bing.ts'

const cases = [
  {
    name: '解析并归一化 Bing 相对地址',
    body: JSON.stringify({
      images: [
        {
          startdate: '20261012',
          url: '/th?id=OHR.Test_1920x1080.jpg&pid=hp',
          urlbase: '/th?id=OHR.Test',
          title: 'Test title',
          copyright: 'Test copyright',
        },
      ],
    }),
    expected: [
      {
        date: '2026-10-12',
        rawDate: '20261012',
        url: 'https://www.bing.com/th?id=OHR.Test_1920x1080.jpg&pid=hp',
        thumbnailUrl: 'https://www.bing.com/th?id=OHR.Test_400x240.jpg',
        title: 'Test title',
        copyright: 'Test copyright',
      },
    ],
  },
  {
    name: '保留 Bing 返回的绝对地址',
    body: JSON.stringify({
      images: [{ startdate: '20261011', url: 'https://cdn.example.com/wallpaper.jpg' }],
    }),
    expected: [
      {
        date: '2026-10-11',
        rawDate: '20261011',
        url: 'https://cdn.example.com/wallpaper.jpg',
        thumbnailUrl: 'https://cdn.example.com/wallpaper.jpg',
        title: '',
        copyright: '',
      },
    ],
  },
  { name: '过滤缺少图片地址的条目', body: JSON.stringify({ images: [{ startdate: '20261010' }] }), expected: [] },
  { name: '响应不是合法 JSON 时返回空数组', body: '<html>bad gateway</html>', expected: [] },
  { name: 'images 不是数组时返回空数组', body: JSON.stringify({ images: {} }), expected: [] },
]

for (const item of cases) {
  assert.deepEqual(parseBingWallpapers(item.body), item.expected, item.name)
  console.log(`✓ ${item.name}`)
}

console.log(`Bing 壁纸解析回归通过：${cases.length} 项`)
