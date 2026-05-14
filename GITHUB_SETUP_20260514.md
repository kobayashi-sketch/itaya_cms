# GitHub共同作業セットアップ 2026-05-14

## このフォルダの目的

`itaya_cms` は、ホテルニューイタヤ デジタルサイネージCMS試作をGitHubで共同作業するための公開用フォルダです。

親フォルダ全体ではなく、このフォルダだけをGitHubに上げます。

## GitHubへ上げる手順

GitHubで空のリポジトリを作成します。

推奨リポジトリ名:

- `itaya_cms`
- `itaya-digital-signage-cms`

ローカルから接続する場合:

```sh
cd "/Users/kazunarikobayashi/Desktop/matome202508/MATOME20250322/ホテルニューイタヤ/デジサイ/itaya_cms"
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

`OWNER/REPOSITORY` はGitHub上で作ったリポジトリに置き換えます。

## GitHub Pagesで見せる場合

GitHubのリポジトリ画面で以下を設定します。

- Settings
- Pages
- Build and deployment
- Source: Deploy from a branch
- Branch: `main`
- Folder: `/root`

公開後の確認URL:

- 管理画面: `公開URL/`
- 広告①: `公開URL/index.html?screen=ad1`
- 広告②: `公開URL/index.html?screen=ad2`
- 会場案内: `公開URL/index.html?screen=venue`

## 共同作業者を追加する場合

GitHubで以下を設定します。

- Settings
- Collaborators
- Add people
- 共同作業者のGitHubユーザー名を追加

## Codexに依頼するとき

例:

```text
itaya_cmsで作業して。会場案内のダークモードだけ、終了済み非表示の時の余白を調整して。
```

```text
itaya_cmsの広告①だけ、横モードのサンプル画像の切替確認をして。
```

## 注意

現在の試作は、入力データを各ブラウザ内に保存します。
GitHub PagesでURLを共有しても、入力データは他の人とは共有されません。

複数人で同じ登録データを共有する場合は、次段階でサーバー保存型に移行します。

