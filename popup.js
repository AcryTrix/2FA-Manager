const extensionAPI = typeof browser !== "undefined" ? browser : chrome;

function storageGet(key) {
	return new Promise((resolve) => {
		extensionAPI.storage.local.get(key, (result) => resolve(result));
	});
}

function storageSet(obj) {
	return new Promise((resolve) => {
		extensionAPI.storage.local.set(obj, () => resolve());
	});
}

function base32Decode(str) {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	str = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
	if (str.length === 0 || str.length % 8 !== 0) {
    throw new Error("Invalid Base32 Secret")
  }
  let bits = 0, value = 0, output = [];
	for (let char of str) {
		let charValue = alphabet.indexOf(char);
		if (charValue === -1) {
      throw new Error("Invalid character in Base32 secret")
    };
		value = (value << 5) | charValue;
		bits += 5;
		if (bits >= 8) {
			output.push((value >>> (bits - 8)) & 0xFF);
			bits -= 8;
		}
	}
	return new Uint8Array(output);
}

async function generateTOTP(secret) {
  try {
    let secretBytes = base32Decode(secret);
	  let timeStep = BigInt(Math.floor(Date.now() / 30000));
	  let timeStepBytes = new Uint8Array(8);
	  for (let i = 7; i >= 0; i--) {
		  timeStepBytes[i] = Number(timeStep & 0xFFn);
		  timeStep = timeStep >> 8n;
	  }
	  let key = await crypto.subtle.importKey(
		  "raw", secretBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
	  );
	  let hmac = await crypto.subtle.sign("HMAC", key, timeStepBytes);
	  let hmacArray = new Uint8Array(hmac);
	  let offset = hmacArray[hmacArray.length - 1] & 0x0F;
	  let code = ((hmacArray[offset] & 0x7F) << 24) |
		  ((hmacArray[offset + 1] & 0xFF) << 16) |
		  ((hmacArray[offset + 2] & 0xFF) << 8) |
		  (hmacArray[offset + 3] & 0xFF);
	  return (code % 1000000).toString().padStart(6, '0');
  } catch (error) {
    console.log("Error generating TOPT: ", error);
    return "Error";
  }
}

async function getAccounts() {
	let result = await storageGet("accounts");
	return result.accounts || [];
}

async function saveAccounts(accounts) {
	await storageSet({ accounts });
}

const ITEMS_PER_PAGE = 5;
let currentPage = 1;
let searchQuery = '';
let lastUpdateTime = 0;

function updateDisplay() {
	getAccounts().then(accounts => {
    let filteredAccounts = accounts.filter(account => 
      account.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    let totalPage = Math.max(1, Math.ceil(filteredAccounts.length / ITEMS_PER_PAGE));
    currentPage = Math.min(currentPage, Math.max(1, totalPage));

		let accountsDiv = document.getElementById("accounts");
		if (filteredAccounts.length === 0) {
      accountsDiv.innerHTML = searchQuery ? "<p>No accounts match your search.</p>" : "<p>No accounts added yet. Click '+' to start.</p>";
      document.getElementById("prev-page").disabled = true;
      document.getElementById("next-page").disabled = true;
      return;
    }

    let currentTime = Math.floor(Date.now() / 30000);
    if (currentTime === lastUpdateTime) {
      return;
    }
    lastUpdateTime = currentTime;

    accountsDiv.innerHTML = "";
    let start = (currentPage - 1) * ITEMS_PER_PAGE;
    let end = start + ITEMS_PER_PAGE;
    let pageAccounts = filteredAccounts.slice(start, end); 

		pageAccounts.forEach((account, index) => {
			generateTOTP(account.secret).then(totp => {
				let accountDiv = document.createElement("div");
				accountDiv.className = "account";
				accountDiv.innerHTML = `<span>${account.name}: ${totp}</span>`;

				let deleteBtn = document.createElement("button");
				deleteBtn.textContent = "Delete";
				deleteBtn.onclick = () => deleteAccount(start + index);

				accountDiv.appendChild(deleteBtn);
        accountsDiv.appendChild(accountDiv);
			});
		});

    document.getElementById("prev-page").disabled = currentPage === 1;
    document.getElementById("next-page").disabled = currentPage === totalPage;
	});
}

async function addAccount() {
	let name = document.getElementById("name").value;
	let secret = document.getElementById("secret").value;
	if (name && secret) {
    try {
      base32Decode(secret);
      let accounts = await getAccounts();
      if (accounts.some(account => account.name === name)) {
        alert("An account with this name already exists.");
      }
		  accounts.push({ name, secret });
		  await saveAccounts(accounts);
		  updateDisplay();
		  document.getElementById("add-form").style.display = "none";
		  document.getElementById("name").value = "";
		  document.getElementById("secret").value = "";
    } catch (error) {
      alert("Invalid secret key. Please enter a valid Base32 secret.");
    }
	} else {
    alert("Please enter both name and secret.");
  }
}

async function deleteAccount(index) {
	let accounts = await getAccounts();
	accounts.splice(index, 1);
	await saveAccounts(accounts);
	updateDisplay();
}

document.addEventListener("DOMContentLoaded", () => {
	updateDisplay();
	setInterval(updateDisplay, 1000);
	document.getElementById("add-account").onclick = () =>
		document.getElementById("add-form").style.display = "block";

	document.getElementById("save-account").onclick = addAccount;
  document.getElementById("cancel-account").onclick = () => {
    document.getElementById("add-form").style.display = "none";
    document.getElementById("name").value = "";
    document.getElementById("secret").value = "";
  };

  document.getElementById("search").oninput = (e) => {
    searchQuery = e.target.value;
    currentPage = 1;
    updateDisplay();
  };

  document.getElementById("prev-page").onclick = () => {
    if (currentPage > 1) {
      currentPage--;
      updateDisplay();
    }
  };

  document.getElementById("next-page").onclick = () => {
    currentPage++;
    updateDisplay();
  };
});
