# Wallet Linking + Auto-Reposition Integration

## Overview

This document explains how users can use **both** wallet linking (secure, read-only) **and** auto-reposition (requires private key) with the same wallet.

---

## The Problem

**Auto-Reposition Requires Private Key**
- Auto-reposition needs to sign transactions automatically
- This requires access to the wallet's private key
- Wallet linking only stores the public key (read-only notifications)

**Previous Limitation:**
- Users had to choose: Linking (secure) OR Auto-reposition (full control)
- Couldn't have both with the same wallet

---

## The Solution: Smart Wallet Upgrade

The system now **automatically upgrades** linked wallets when you import the private key!

### How It Works

```
1. User links wallet from website
   ↓
   Creates "ghost user" with public key only
   ↓
   Notifications work, but no auto-reposition

2. User imports same wallet to Telegram
   ↓
   System detects ghost user
   ↓
   Deletes ghost user (in transaction)
   ↓
   Creates real wallet with encrypted private key
   ↓
   Auto-reposition now enabled! ✅
```

---

## User Flow

### Step 1: Link Wallet (Website → Telegram)

**Website:**
1. Connect wallet (Phantom/Solflare)
2. Click "Link to Telegram"
3. Scan QR code or use link code

**Telegram:**
- Receives notifications for positions
- Can view positions
- **Cannot** auto-reposition (no private key)

**Database State:**
```javascript
{
  userId: "user-1765739704724-0npfc7",  // Ghost user ID
  telegramId: -1765739704724n,           // Negative (synthetic)
  username: "web-PSKhtWpc",              // Starts with "web-"
  wallet: {
    publicKey: "PSKhtWpc...",
    encrypted: null,                     // No private key
    iv: null
  }
}
```

### Step 2: Import Wallet (Enable Auto-Reposition)

**Telegram:**
1. Click "Import Wallet"
2. Paste private key (any of 5 supported formats)
3. System detects this wallet is already linked
4. **Automatically upgrades!**

**What Happens:**
```typescript
// Before: Ghost user with public key only
DELETE wallet WHERE userId = 'ghost-user-id'
DELETE user WHERE id = 'ghost-user-id'

// After: Real user with encrypted private key
CREATE wallet {
  userId: 'real-telegram-user-id',
  publicKey: 'PSKhtWpc...',
  encrypted: '[encrypted-private-key]',  // ✅ Now has private key!
  iv: '[initialization-vector]'
}
```

**Success Message:**
```
✅ Wallet Imported Successfully!

📍 Address:
`PSKhtWpc...`

✨ Format detected: base58

🚀 Auto-Reposition Enabled!
Your wallet can now execute automatic repositions.

💡 Use /settings to configure auto-reposition.
```

**Database State:**
```javascript
{
  userId: "6a85e906-4704-47c7-a93e-0e46821b9cd7", // Real user ID
  telegramId: 677505365n,                         // Your Telegram ID
  username: "your-username",
  wallet: {
    publicKey: "PSKhtWpc...",
    encrypted: "ZGF0YS4uLg==",                   // ✅ Encrypted private key
    iv: "aXYuLi4="                               // ✅ Encryption IV
  }
}
```

---

## Features Enabled

### Before Import (Linked Only)
- ✅ Receive notifications
- ✅ View positions
- ✅ Check balances
- ❌ Auto-reposition
- ❌ Create positions from Telegram
- ❌ Execute transactions

### After Import (Full Control)
- ✅ Receive notifications
- ✅ View positions
- ✅ Check balances
- ✅ **Auto-reposition** 🚀
- ✅ Create positions from Telegram
- ✅ Execute transactions
- ✅ All features unlocked!

---

## Security Considerations

### Ghost User Detection

The system identifies ghost users by checking:
```typescript
const isGhostUser =
  existingPublicKey.user.username?.startsWith('web-') ||
  existingPublicKey.user.telegramId.toString().startsWith('-');
```

**Ghost User Characteristics:**
- Username starts with `web-`
- Telegram ID is negative (e.g., `-1765739704724`)
- Created automatically by wallet linking
- No real Telegram account associated

### Transaction Safety

The upgrade happens in a **database transaction**:
```typescript
await prisma.$transaction(async (tx) => {
  await tx.wallet.delete({ where: { userId: ghostUserId } });
  await tx.user.delete({ where: { id: ghostUserId } });
  return await tx.wallet.create({
    data: { userId, publicKey, encrypted, iv, source: 'telegram' }
  });
});
```

**Why This Is Safe:**
- All-or-nothing operation (rollback on error)
- No risk of losing wallet data
- Ghost user fully removed before creating real wallet
- Prevents duplicate publicKey errors

---

## Code Implementation

### Database Layer (`db.ts`)

```typescript
export async function createWallet(
  userId: string,
  publicKey: string,
  encrypted: string,
  iv: string
) {
  const existingPublicKey = await prisma.wallet.findUnique({
    where: { publicKey },
    include: { user: true }
  });

  if (existingPublicKey) {
    const isGhostUser =
      existingPublicKey.user.username?.startsWith('web-') ||
      existingPublicKey.user.telegramId.toString().startsWith('-');

    if (isGhostUser) {
      // Upgrade: Delete ghost, create real wallet
      return await prisma.$transaction(async (tx) => {
        await tx.wallet.delete({ where: { userId: ghostUserId } });
        await tx.user.delete({ where: { id: ghostUserId } });
        return await tx.wallet.create({
          data: { userId, publicKey, encrypted, iv, source: 'telegram' }
        });
      });
    } else {
      throw new Error('This wallet is already imported by another Telegram account');
    }
  }

  return prisma.wallet.create({
    data: { userId, publicKey, encrypted, iv, source: 'telegram' }
  });
}
```

### Wallet Handler (`wallet.ts`)

Success message now highlights auto-reposition:
```typescript
await ctx.reply(
  `✅ **Wallet Imported Successfully!**\n\n` +
  `📍 Address:\n\`${result.publicKey}\`\n\n` +
  `✨ Format detected: **${result.format}**\n\n` +
  `🚀 **Auto-Reposition Enabled!**\n` +
  `Your wallet can now execute automatic repositions.\n\n` +
  `💡 Use /settings to configure auto-reposition.`,
  { parse_mode: 'Markdown' }
);
```

---

## Testing

### Test Scenario: Website → Telegram Upgrade

1. **Link wallet from website:**
   ```bash
   # Check database
   SELECT * FROM users WHERE username LIKE 'web-%';
   SELECT * FROM wallets WHERE "publicKey" = 'YOUR_PUBLIC_KEY';
   ```
   Expected: Ghost user exists with wallet (no encrypted key)

2. **Import same wallet to Telegram:**
   ```
   Bot: Click "Import Wallet"
   You: [paste private key in any format]
   ```

3. **Verify upgrade:**
   ```bash
   # Check database again
   SELECT * FROM users WHERE username LIKE 'web-%';
   # Should return 0 rows (ghost deleted)

   SELECT * FROM wallets WHERE "publicKey" = 'YOUR_PUBLIC_KEY';
   # Should show wallet under your real user ID
   # With encrypted and iv fields populated
   ```

4. **Test auto-reposition:**
   ```
   /settings
   /enableauto
   ```
   Should work! ✅

---

## Error Handling

### Case 1: Ghost User (Website Link)
**Scenario:** Wallet is linked from website
**Result:** ✅ Automatically upgraded to full wallet
**Message:** "Auto-Reposition Enabled!"

### Case 2: Real User (Another Telegram Account)
**Scenario:** Wallet already imported by different Telegram user
**Result:** ❌ Import blocked
**Message:**
```
⚠️ Wallet Already In Use

This wallet is already imported by another Telegram account.

Options:
• Use a different wallet
• Delete the wallet from the other account first
• Create a new wallet with /start
```

### Case 3: Same User (Already Imported)
**Scenario:** You already imported this wallet before
**Result:** ❌ Import blocked
**Message:** "⚠️ You already have a wallet!"

---

## Benefits

### For Users
1. **Flexible Workflow**
   - Start with secure linking (no private key exposure)
   - Upgrade to auto-reposition when ready

2. **Same Wallet Everywhere**
   - Use in browser (Phantom/Solflare)
   - Use on website (manual trading)
   - Use in Telegram (notifications + auto-reposition)

3. **No Duplication**
   - One wallet, multiple access methods
   - Unified position history
   - Consistent notifications

### For Security
1. **Gradual Trust**
   - Users can test linking first
   - Import private key only if they want auto-reposition

2. **Clear Upgrade Path**
   - Explicit user action required (import)
   - User knows what they're enabling

3. **Transaction Safety**
   - Database transaction prevents data loss
   - No orphaned wallets or ghost users

---

## Migration Notes

### Existing Ghost Users

If users already have ghost users from previous linking:
- They will be automatically cleaned up on import
- No manual migration needed
- Seamless upgrade experience

### Cleanup Script

For manual cleanup (if needed):
```javascript
// clean_ghost_users.mjs
const ghostUsers = await prisma.user.findMany({
  where: {
    OR: [
      { username: { startsWith: 'web-' } },
      { telegramId: { lt: 0 } }  // Negative IDs
    ]
  },
  include: { wallet: true }
});

for (const ghost of ghostUsers) {
  if (ghost.wallet) {
    await prisma.wallet.delete({ where: { userId: ghost.id } });
  }
  await prisma.user.delete({ where: { id: ghost.id } });
}
```

---

## Future Enhancements

### Potential Features
1. **Partial Upgrade** - Link for notifications, import only for auto-reposition (keep private key in bot, but separate from linking)
2. **Multi-Wallet Support** - Allow users to have multiple wallets (browser + Telegram)
3. **Wallet Tagging** - Label wallets as "Main", "Trading", "Auto-Reposition"
4. **Permission Levels** - Fine-grained control over what the bot can do

---

## Conclusion

This solution provides the **best of both worlds**:
- ✅ Secure linking for notifications (no private key needed)
- ✅ Full import for auto-reposition (when user wants it)
- ✅ Same wallet works everywhere (browser, website, Telegram)
- ✅ Automatic upgrade (no manual steps)

**Users can now link wallets first** (safe, read-only) and **upgrade later** when they're ready to enable auto-reposition! 🚀
