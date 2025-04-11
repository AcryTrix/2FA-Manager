function storageGet(key) {
	return new Promise((resolve) => {
		chrome.storage.local.get(key, (result) => resolve(result));
	});
}

function storageSet(obj) {
	return new Promise((resolve) => {
		chrome.storage.local.set(obj, () => resolve());
	});
}

function base32Decode(str) {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	str = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
	let bits = 0, value = 0, output = [];
	for (let char of str) {
		let charValue = alphabet.indexOf(char);
		if (charValue === -1) continue;
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
}

async function getAccounts() {
	let result = await storageGet("accounts");
	return result.accounts || [];
}

async function saveAccounts(accounts) {
	await storageSet({ accounts });
}

function updateDisplay() {
	getAccounts().then(accounts => {
		let accountsDiv = document.getElementById("accounts");
		accountsDiv.innerHTML = accounts.length === 0
			? "<p>No accounts added yet. Click '+' to start.</p>"
			: "";
		accounts.forEach((account, index) => {
			generateTOTP(account.secret).then(totp => {
				let accountDiv = document.createElement("div");
				accountDiv.className = "account";
				accountDiv.innerHTML = `<span>${account.name}: ${totp}</span>`;
				let deleteBtn = document.createElement("button");
				deleteBtn.textContent = "Delete";
				deleteBtn.onclick = () => deleteAccount(index);
				accountDiv.appendChild(deleteBtn);
				accountsDiv.appendChild(accountDiv);
			});
		});
	});
}

async function addAccount() {
	let name = document.getElementById("name").value;
	let secret = document.getElementById("secret").value;
	if (name && secret) {
		let accounts = await getAccounts();
		accounts.push({ name, secret });
		await saveAccounts(accounts);
		updateDisplay();
		document.getElementById("add-form").style.display = "none";
		document.getElementById("name").value = "";
		document.getElementById("secret").value = "";
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
	// Update every 30 seconds to align with TOTP time steps
	setInterval(updateDisplay, 30000);
	document.getElementById("add-account").onclick = () =>
		document.getElementById("add-form").style.display = "block";
	document.getElementById("save-account").onclick = addAccount;
});
