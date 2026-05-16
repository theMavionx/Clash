#!/bin/bash
# Run after every Godot Web export to patch the generated runtime.
# Usage: bash patch_workjs.sh
FILE="web/public/godot/Work.js"
if [ -f "$FILE" ]; then
    sed -i "s|\[\`\${loadPath}.side.wasm\`\].concat(this.gdextensionLibs)|[].concat(this.gdextensionLibs)|g" "$FILE"
    node - "$FILE" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
let source = fs.readFileSync(file, 'utf8');

const safariGuard = 'var currentSafariVersion=userAgent.includes("Safari/")&&userAgent.match(/Version\\/(\\d+\\.?\\d*\\.?\\d*)/)?humanReadableVersionToPacked(userAgent.match(/Version\\/(\\d+\\.?\\d*\\.?\\d*)/)[1]):TARGET_NOT_SUPPORTED;';
const patchedSafariGuard = 'var currentSafariVersion=!(userAgent.includes("Android")&&(/; wv\\)|Version\\/4\\.0|Phantom\\/android/i.test(userAgent)))&&userAgent.includes("Safari/")&&userAgent.match(/Version\\/(\\d+\\.?\\d*\\.?\\d*)/)?humanReadableVersionToPacked(userAgent.match(/Version\\/(\\d+\\.?\\d*\\.?\\d*)/)[1]):TARGET_NOT_SUPPORTED;';

if (source.includes(safariGuard)) {
    source = source.replace(safariGuard, patchedSafariGuard);
} else if (!source.includes(patchedSafariGuard) && source.includes('requires Safari')) {
    console.error('Work.js Safari guard pattern not found');
    process.exit(1);
}

fs.writeFileSync(file, source);
NODE
    echo "Patched $FILE"
else
    echo "Work.js not found"
fi

HTML_FILE="web/public/godot/Work.html"
if [ -f "$HTML_FILE" ]; then
    node - "$HTML_FILE" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
let source = fs.readFileSync(file, 'utf8');

const guardMarker = 'data-clash-title-guard';
const titleGuard = `\t\t<script ${guardMarker}>
(function () {
\tvar title = 'Clash of Perps';
\tfunction keepTitle() {
\t\tif (document.title !== title) document.title = title;
\t}
\tkeepTitle();
\tvar titleNode = document.querySelector('title');
\tif (titleNode && window.MutationObserver) {
\t\tnew MutationObserver(keepTitle).observe(titleNode, {
\t\t\tchildList: true,
\t\t\tcharacterData: true,
\t\t\tsubtree: true
\t\t});
\t}
\twindow.addEventListener('load', keepTitle);
\tsetInterval(keepTitle, 500);
})();
\t\t</script>`;

if (!source.includes(guardMarker)) {
    if (!source.includes('</head>')) {
        console.error('Work.html </head> not found');
        process.exit(1);
    }
    source = source.replace('</head>', `${titleGuard}\n\t</head>`);
}

fs.writeFileSync(file, source);
NODE
    echo "Patched $HTML_FILE"
else
    echo "Work.html not found"
fi
