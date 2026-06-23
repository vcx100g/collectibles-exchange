// Account menu for the connect button: Switch account / Disconnect — the things
// a bare eth_requestAccounts button can't do.
//   - Switch  -> wallet_requestPermissions forces MetaMask's account picker even
//               when already connected (a plain eth_requestAccounts is silent).
//   - Disconnect -> wallet_revokePermissions, plus a local flag so the page does
//               NOT silently auto-reconnect on the next load (works even on
//               wallets that don't support revoke).
const AUTO_KEY = "vaultx:disconnected";

export const suppressAutoConnect = () => sessionStorage.getItem(AUTO_KEY) === "1";
export const clearSuppress = () => sessionStorage.removeItem(AUTO_KEY);

export async function requestSwitch() {
  if (!window.ethereum) return;
  const active = async () => (await window.ethereum.request({ method: "eth_accounts" }).catch(() => []))[0] || "";
  const before = await active();
  try {
    await window.ethereum.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
  } catch {
    return; // user dismissed the dialog
  }
  clearSuppress();
  const after = await active();
  if (after && after.toLowerCase() !== before.toLowerCase()) {
    location.reload(); // the active account actually changed — load into it
  } else {
    // Granting permission does NOT change MetaMask's active account — only the
    // user can. Guide them to finish the switch in the extension.
    alert(
      "Still on the same account.\n\n" +
      "MetaMask doesn't let a website choose your active account. To switch:\n" +
      "• open the MetaMask extension\n" +
      "• click the account name at the top\n" +
      "• pick the account you want\n\n" +
      "The page updates automatically. (Or in the connect dialog, select ONLY the account you want.)"
    );
  }
}

export async function requestDisconnect() {
  sessionStorage.setItem(AUTO_KEY, "1"); // stop the auto-reconnect on reload
  try {
    await window.ethereum?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
  } catch {
    // older wallets lack revoke — the flag above still logs us out locally
  }
  location.reload();
}

// Turn the connect button into a dropdown (address + Switch + Disconnect).
// Idempotent within a page load; the page is reloaded on any account change.
export function attachWalletMenu(button, address) {
  if (!button) return;
  button.title = address || "";
  if (button.dataset.walletMenu === "1") return;
  button.dataset.walletMenu = "1";

  const wrap = document.createElement("div");
  wrap.className = "dropdown d-inline-block";
  button.parentNode.insertBefore(wrap, button);
  wrap.appendChild(button);
  button.classList.add("dropdown-toggle");
  button.setAttribute("data-bs-toggle", "dropdown");
  button.setAttribute("aria-expanded", "false");

  const menu = document.createElement("ul");
  menu.className = "dropdown-menu dropdown-menu-end";
  menu.innerHTML = `
    <li><h6 class="dropdown-header mono" style="font-size:.7rem">${address || ""}</h6></li>
    <li><hr class="dropdown-divider"></li>
    <li><button class="dropdown-item" type="button" data-wallet="switch">🔄 Switch account</button></li>
    <li><button class="dropdown-item text-danger" type="button" data-wallet="disconnect">🚪 Disconnect</button></li>`;
  wrap.appendChild(menu);

  menu.querySelector("[data-wallet=switch]").addEventListener("click", requestSwitch);
  menu.querySelector("[data-wallet=disconnect]").addEventListener("click", requestDisconnect);
}
