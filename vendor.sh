#!/usr/bin/env bash
# EG Grid — Interactive vendoring script
# Usage: curl -fsSL https://raw.githubusercontent.com/derekr/eg-grid/main/vendor.sh | bash
set -euo pipefail

REPO="derekr/eg-grid"
BRANCH="main"
BASE="https://raw.githubusercontent.com/$REPO/$BRANCH/dist"

# ─── Colors ───
bold="\033[1m" dim="\033[2m" green="\033[32m" blue="\033[34m" cyan="\033[36m" reset="\033[0m"

echo -e "${bold}EG Grid${reset} — vendor a bundle into your project\n"

# ─── Bundle selection ───
echo -e "${bold}Which bundle?${reset}"
echo -e "  ${cyan}1${reset}) eg-grid.js         — core library (8.8 KB gzip)"
echo -e "  ${cyan}2${reset}) eg-grid-element.js  — web component (10.9 KB gzip)"
echo -e "  ${cyan}3${reset}) both"
echo ""
printf "Choice [1]: "
read -r choice
choice="${choice:-1}"

case "$choice" in
  1) bundles=("eg-grid.js") ;;
  2) bundles=("eg-grid-element.js") ;;
  3) bundles=("eg-grid.js" "eg-grid-element.js") ;;
  *) echo "Invalid choice"; exit 1 ;;
esac

# ─── Output directory ───
printf "\nOutput directory [./lib]: "
read -r outdir
outdir="${outdir:-./lib}"
mkdir -p "$outdir"

# ─── Download ───
echo ""
for bundle in "${bundles[@]}"; do
  url="$BASE/$bundle"
  dest="$outdir/$bundle"
  echo -e "${dim}Downloading $bundle...${reset}"
  if curl -fsSL "$url" -o "$dest"; then
    size=$(wc -c < "$dest" | tr -d ' ')
    echo -e "  ${green}✓${reset} $dest (${size} bytes)"
  else
    echo -e "  ✗ Failed to download $bundle"
    exit 1
  fi
done

# ─── Grid configuration ───
echo ""
echo -e "${bold}Configure a starter grid?${reset} (generates HTML + CSS)"
printf "Columns [4]: "
read -r cols
cols="${cols:-4}"

printf "Number of items [6]: "
read -r nitems
nitems="${nitems:-6}"

printf "Algorithm (push/none) [push]: "
read -r algo
algo="${algo:-push}"

printf "Gap in px [8]: "
read -r gap
gap="${gap:-8}"

# ─── Generate output ───
echo ""
echo -e "${bold}──────────────────────────────────────────${reset}"

# Build items HTML
items=""
labels=(A B C D E F G H I J K L M N O P Q R S T U V W X Y Z)
for ((i=0; i<nitems; i++)); do
  label="${labels[$i]:-Item$((i+1))}"
  id=$(echo "$label" | tr '[:upper:]' '[:lower:]')
  items="$items  <div data-egg-item=\"$id\">$label</div>\n"
done

if [[ " ${bundles[*]} " =~ "eg-grid-element.js" ]]; then
  # Web component version
  algo_attr=""
  if [[ "$algo" != "none" ]]; then
    algo_attr=" algorithm=\"$algo\""
  fi

  echo -e "${bold}HTML:${reset}\n"
  echo -e "${dim}<script type=\"module\" src=\"$outdir/eg-grid-element.js\"></script>

<eg-grid columns=\"$cols\" gap=\"$gap\"$algo_attr resize-handles=\"all\">
$items</eg-grid>${reset}"

  echo ""
  echo -e "${bold}CSS:${reset}\n"
  echo -e "${dim}eg-grid {
  display: grid;
  grid-template-columns: repeat($cols, 1fr);
  gap: ${gap}px;
  grid-auto-rows: 120px;
}

[data-egg-item] {
  background: #f0f0f0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
}

[data-egg-dragging] { cursor: grabbing; opacity: 0.8; z-index: 100; }
[data-egg-selected] { outline: 2px solid #3b82f6; }

::view-transition-group(*) {
  animation-duration: 200ms;
  animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
}${reset}"

else
  # Core library version
  algo_opt="false"
  if [[ "$algo" != "none" ]]; then
    algo_opt="'$algo'"
  fi

  echo -e "${bold}HTML:${reset}\n"
  echo -e "${dim}<div class=\"grid\" id=\"grid\">
$items</div>
<style id=\"egg-styles\"></style>

<script type=\"module\">
  import { init } from '$outdir/eg-grid.js';

  const core = init(document.getElementById('grid'), {
    algorithm: $algo_opt,
    styleElement: document.getElementById('egg-styles'),
    resize: { handles: 'all' },
  });
</script>${reset}"

  echo ""
  echo -e "${bold}CSS:${reset}\n"
  echo -e "${dim}.grid {
  display: grid;
  grid-template-columns: repeat($cols, 1fr);
  gap: ${gap}px;
  grid-auto-rows: 120px;
}

[data-egg-item] {
  background: #f0f0f0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
}

[data-egg-dragging] { cursor: grabbing; opacity: 0.8; z-index: 100; }
[data-egg-selected] { outline: 2px solid #3b82f6; }

::view-transition-group(*) {
  animation-duration: 200ms;
  animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
}${reset}"
fi

echo ""
echo -e "${bold}──────────────────────────────────────────${reset}"
echo -e "\n${green}Done!${reset} Files in ${cyan}$outdir/${reset}"
echo -e "Docs: ${blue}https://derekr.github.io/eg-grid/${reset}"
