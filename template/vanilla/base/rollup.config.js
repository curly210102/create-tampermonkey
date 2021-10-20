// rollup.config.js
import { defineConfig } from 'rollup'
import userScriptHeader from 'rollup-plugin-tampermonkey-header'
import pkg from './package.json'
import path from 'path'

function devConfigs() {
  let userScriptHeaderContent = []
  const outputFile = `${pkg.name ?? 'userscript'}.dev`
  return defineConfig({
    input: {
      [outputFile]: 'src/main.js'
    },
    output: {
      dir: 'dist',
      format: 'iife',
      sourcemap: 'inline'
    },
    watch: {
      exclude: 'dist'
    },
    plugins: [
      userScriptHeader({
        transformHeaderContent(items) {
          const newItems = items
            .filter(([name]) => !['@supportURL', '@updateURL', '@downloadURL'].includes(name))
            .map(([name, value]) => {
              if (name === '@name') {
                return [name, `${value} Dev`]
              } else {
                return [name, value]
              }
            })
          userScriptHeaderContent = [...newItems]
          return newItems
        }
      }),
      devEntryPlugin(`${outputFile}.js`)
    ]
  })

  function devEntryPlugin(outputFileName) {
    let headerPluginApi
    let devFileContentCache = ''
    return {
      name: 'generate-dev-entry',
      buildStart(options) {
        const { plugins } = options
        const pluginName = 'tampermonkey-header'
        const headerPlugin = plugins.find((plugin) => plugin.name === 'tampermonkey-header')
        if (!headerPlugin) {
          // or handle this silently if it is optional
          throw new Error(`This plugin depends on the "${pluginName}" plugin.`)
        }
        // now you can access the API methods in subsequent hooks
        headerPluginApi = headerPlugin.api
      },
      generateBundle(options, bundle) {
        const { dir } = options
        const { fileName } = bundle[outputFileName]
        const filePath = path.resolve(__dirname, dir, fileName)
        userScriptHeaderContent.push(['@require', filePath])
        const devFileName = 'dev.user.js'
        const devFilePath = path.resolve(__dirname, dir, devFileName)
        const devFileContent =
          headerPluginApi?.generateUserScriptHeader(userScriptHeaderContent) ?? ''

        if (devFileContentCache !== devFileContent) {
          this.emitFile({
            type: 'asset',
            fileName: devFileName,
            source: devFileContent
          })
          console.log(
            '\nDev mode plugin is created. Please paste the file path to browser and install in Tampermonkey: \n\x1b[1m\x1b[4m\x1b[36m%s\x1b[0m\n',
            devFilePath
          )
          devFileContentCache = devFileContent
        }
      }
    }
  }
}

function prodConfigs() {
  return defineConfig({
    input: 'src/main.js',
    output: {
      file: `${pkg.name ?? 'userscript'}.user.js`,
      format: 'iife'
    },
    plugins: [userScriptHeader()]
  })
}

const isDev = process.env.BUILD === 'development'
export default isDev ? devConfigs() : prodConfigs()