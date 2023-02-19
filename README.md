# ddu-source-ghq

ghq(1) source for ddu.vim

This source collects repositories' paths listed by ghq.

Please read [help](doc/ddu-source-ghq.txt) for details.

## Requirements

- [ghq](https://github.com/x-motemen/ghq)
- [denops.vim](https://github.com/vim-denops/denops.vim)
- [ddu.vim](https://github.com/Shougo/ddu.vim)
- [ddu-kind-file](https://github.com/Shougo/ddu-kind-file)

## Configuration

```vim
" Use ghq source.
call ddu#start({ 'sources': [{ 'name': 'ghq' }] })

" Set binary path for ghq.
call ddu#custom#patch_global('sourceParams', {
      \ 'ghq': { 'bin': expand('~/.local/bin/ghq') },
      \ })

" Display as owner/repo style.
call ddu#custom#patch_global('sourceParams', {
      \ 'ghq': {
      \   'display': 'relative',
      \   'rootPath': expand('~/ghq/github.com'),
      \ },
      \ })
```
