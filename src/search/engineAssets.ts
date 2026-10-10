import baiduIcon from '../assets/search-engines/baidu-icon.png'
import baiduLogo from '../assets/search-engines/baidu-logo.png'
import bingIcon from '../assets/search-engines/bing-icon.png'
import bingLogo from '../assets/search-engines/bing-logo.png'
import googleIcon from '../assets/search-engines/google-icon.png'
import googleLogo from '../assets/search-engines/google-logo.png'
import type { SearchEngine } from '../config/schema.ts'

export interface SearchEngineAssets {
  icon: string
  logo: string
}

const ENGINE_ASSETS: Record<SearchEngine, SearchEngineAssets> = {
  google: { icon: googleIcon, logo: googleLogo },
  baidu: { icon: baiduIcon, logo: baiduLogo },
  bing: { icon: bingIcon, logo: bingLogo },
}

export function getSearchEngineAssets(engine: SearchEngine): SearchEngineAssets {
  return ENGINE_ASSETS[engine]
}
