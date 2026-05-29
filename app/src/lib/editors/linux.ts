import { pathExists } from '../helpers/linux'
import { IFoundEditor } from './found-editor'

/** Represents an external editor on Linux */
interface ILinuxExternalEditor {
  /** Name of the editor. It will be used both as identifier and user-facing. */
  readonly name: string

  /** List of possible paths where the editor's executable might be located. */
  readonly paths: string[]
}

/**
 * This list contains all the external editors supported on Linux. Add a new
 * entry here to add support for your favorite editor.
 **/
const HOME = process.env.HOME ?? process.cwd()
const editors: ILinuxExternalEditor[] = [
  {
    name: 'Atom',
    paths: ['/snap/bin/atom', '/usr/bin/atom'],
  },
  {
    name: 'Neovim',
    paths: ['/usr/bin/nvim'],
  },
  {
    name: 'Neovim-Qt',
    paths: ['/usr/bin/nvim-qt'],
  },
  {
    name: 'Neovide',
    paths: ['/usr/bin/neovide'],
  },
  {
    name: 'gVim',
    paths: ['/usr/bin/gvim'],
  },
  {
    name: 'Visual Studio Code',
    paths: [
      '/usr/share/code/bin/code',
      '/snap/bin/code',
      '/usr/bin/code',
      '/mnt/c/Program Files/Microsoft VS Code/bin/code',
      '/var/lib/flatpak/app/com.visualstudio.code/current/active/export/bin/com.visualstudio.code',
      `${HOME}/.local/share/flatpak/app/com.visualstudio.code/current/active/export/bin/com.visualstudio.code`,
    ],
  },
  {
    name: 'Visual Studio Code (Insiders)',
    paths: [
      '/snap/bin/code-insiders',
      '/usr/bin/code-insiders',
      '/var/lib/flatpak/app/com.visualstudio.code.insiders/current/active/export/bin/com.visualstudio.code.insiders',
      `${HOME}/.local/share/flatpak/app/com.visualstudio.code.insiders/current/active/export/bin/com.visualstudio.code.insiders`,
    ],
  },
  {
    name: 'VSCodium',
    paths: [
      '/usr/bin/codium',
      '/var/lib/flatpak/app/com.vscodium.codium/current/active/export/bin/com.vscodium.codium',
      '/usr/share/vscodium-bin/bin/codium',
      `${HOME}/.local/share/flatpak/app/com.vscodium.codium/current/active/export/bin/com.vscodium.codium`,
      '/snap/bin/codium',
    ],
  },
  {
    name: 'VSCodium (Insiders)',
    paths: ['/usr/bin/codium-insiders'],
  },
  {
    name: 'Sublime Text',
    paths: ['/usr/bin/subl'],
  },
  {
    name: 'Typora',
    paths: ['/usr/bin/typora'],
  },
  {
    name: 'SlickEdit',
    paths: [
      '/opt/slickedit-pro2018/bin/vs',
      '/opt/slickedit-pro2017/bin/vs',
      '/opt/slickedit-pro2016/bin/vs',
      '/opt/slickedit-pro2015/bin/vs',
    ],
  },
  {
    // Code editor for elementary OS
    // https://github.com/elementary/code
    name: 'Code',
    paths: ['/usr/bin/io.elementary.code'],
  },
  {
    name: 'Lite XL',
    paths: ['/usr/bin/lite-xl'],
  },
  {
    name: 'JetBrains PhpStorm',
    paths: [
      '/snap/bin/phpstorm',
      `${HOME}/.local/share/JetBrains/Toolbox/scripts/PhpStorm`,
    ],
  },
  {
    name: 'JetBrains WebStorm',
    paths: [
      '/snap/bin/webstorm',
      `${HOME}/.local/share/JetBrains/Toolbox/scripts/webstorm`,
    ],
  },
  {
    name: 'IntelliJ IDEA',
    paths: [
      '/snap/bin/idea',
      `${HOME}/.local/share/JetBrains/Toolbox/scripts/idea`,
    ],
  },
  {
    name: 'IntelliJ IDEA Ultimate Edition',
    paths: [
      '/snap/bin/intellij-idea-ultimate',
      '/usr/bin/intellij-idea-ultimate-edition',
      `${HOME}/.local/share/JetBrains/Toolbox/scripts/intellij-idea-ultimate`,
    ],
  },
  {
    name: 'JetBrains Goland',
    paths: [
      '/snap/bin/goland',
      `${HOME}/.local/share/JetBrains/Toolbox/scripts/goland`,
    ],
  },
  {
    name: 'JetBrains CLion',
    paths: [
      '/snap/bin/clion',
      `${HOME}/.local/share/JetBrains/Toolbox/scripts/clion1`,
    ],
  },
  {
    name: 'JetBrains Rider',
    paths: [
      '/snap/bin/rider',
      `${HOME}/.local/share/JetBrains/Toolbox/scripts/rider`,
    ],
  },
  {
    name: 'JetBrains RubyMine',
    paths: [
      '/snap/bin/rubymine',
      `${HOME}/.local/share/JetBrains/Toolbox/scripts/rubymine`,
    ],
  },
  {
    name: 'JetBrains PyCharm',
    paths: [
      '/snap/bin/pycharm',
      '/snap/bin/pycharm-professional',
      `${HOME}/.local/share/JetBrains/Toolbox/scripts/pycharm`,
    ],
  },
  {
    name: 'JetBrains RustRover',
    paths: [
      '/snap/bin/rustrover',
      `${HOME}/.local/share/JetBrains/Toolbox/scripts/rustrover`,
    ],
  },
  {
    name: 'Android Studio',
    paths: [
      '/snap/bin/studio',
      `${HOME}/.local/share/JetBrains/Toolbox/scripts/studio`,
    ],
  },
  {
    name: 'Emacs',
    paths: ['/snap/bin/emacs', '/usr/local/bin/emacs', '/usr/bin/emacs'],
  },
  {
    name: 'Kate',
    paths: ['/usr/bin/kate'],
  },
  {
    name: 'GEdit',
    paths: ['/usr/bin/gedit'],
  },
  {
    name: 'GNOME Text Editor',
    paths: ['/usr/bin/gnome-text-editor'],
  },
  {
    name: 'GNOME Builder',
    paths: ['/usr/bin/gnome-builder'],
  },
  {
    name: 'Notepadqq',
    paths: ['/usr/bin/notepadqq'],
  },
  {
    name: 'Mousepad',
    paths: ['/usr/bin/mousepad'],
  },
  {
    name: 'Pulsar',
    paths: ['/usr/bin/pulsar'],
  },
  {
    name: 'Pluma',
    paths: ['/usr/bin/pluma'],
  },
  {
    name: 'Zed',
    paths: [
      '/usr/bin/zedit',
      '/usr/bin/zeditor',
      '/usr/bin/zed-editor',
      `${HOME}/.local/bin/zed`,
      '/usr/bin/zed',
    ],
  },
]

async function getAvailablePath(paths: string[]): Promise<string | null> {
  for (const path of paths) {
    if (await pathExists(path)) {
      return path
    }
  }

  return null
}

export async function getAvailableEditors(): Promise<
  ReadonlyArray<IFoundEditor<string>>
> {
  const resultsAndNulls = await Promise.all(
    editors.map(async editor => {
      const path = await getAvailablePath(editor.paths)
      return path ? { editor: editor.name, path } : null
    })
  )
  return resultsAndNulls.filter(result => result !== null)
}
