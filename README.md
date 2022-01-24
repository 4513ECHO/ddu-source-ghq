# ddu-source-ghq

ghq source for ddu.vim

This source collects repositories' paths listed by ghq.

## Requirements

- [ghq](https://github.com/x-motemen/ghq)
- [denops.vim](https://github.com/vim-denops/denops.vim)
- [ddu.vim](https://github.com/Shoguo/ddu.vim)
- [ddu-kind-file](https://github.com/Shougo/ddu-kind-file)

## Configuration

```vim
" Use ghq source.
call ddu#start({'sources': [{'name': 'ghq'}]})

" Set filepath for ghq.
call ddu#custom#patch_global('sourceParams', {
      \ 'ghq': {
      \   'bin': expand('~/.local/bin/ghq')
      \ }})
```
