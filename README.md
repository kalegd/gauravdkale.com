# Gaurav D. Kale

A static portfolio with a scroll-driven WebGL scene, current projects, and selected engineering experience.

## Run locally

From the repository root, run this with Python 3 installed.

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open http://127.0.0.1:4173 and reload the page after edits. If you have npm, `npm run preview` starts the same server.

## GitHub Pages

1. In **Settings → Pages**, choose **Deploy from a branch** and select **main** and **/(root)**. GitHub Pages serves `index.html` and its assets directly. The `.nojekyll` file skips Jekyll. [Configure the publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
2. Add your domain under **Custom domain** before pointing DNS at GitHub Pages. GitHub creates the `CNAME` file on the publishing branch. For an apex domain such as `gauravdkale.com`, use the GitHub Pages apex DNS records. For a subdomain such as `www`, use a CNAME record pointing to `kalegd.github.io`. Enable **Enforce HTTPS** once it’s available. [Configure a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)

## Project files

Main page copy lives in `index.html` and the project and work detail panels in `src/content.js`. The particle geometry, shaders, and scroll timeline live in `src/scene.js`. The site also works with reduced motion or unavailable WebGL.

Selected Work samples particle positions and colors from the images in `assets/work/`. The phone silhouette is original artwork. [Bhutan flag](https://commons.wikimedia.org/wiki/File:Flag_of_Bhutan.svg), [Universal Verify shield](https://universalverify.com/), [Amazon wordmark](https://press.aboutamazon.com/logos?p=4), [TaxToken icon](https://taxtoken.io/), [Capital One wordmark](https://www.capitalone.com/).
