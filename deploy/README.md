# Phase 1 Runbook — Deploy Hubs CE on a single K3s server

Takes one person about half a day. Covers issues #7 (deploy), #8 (point the device check at our server) and #9 (measure data use), then **Gate 1** (#10).

| You need first | Issue |
| :--- | :--- |
| A domain (four A records will point at the server) | #3 |
| A hosting account: **Hetzner Cloud, Singapore** (or a Manila VPS) | #4 |
| SMTP credentials for teacher sign-in emails (any transactional mail provider) | — |
| The client image `ghcr.io/ben010618/classroom-hubs:latest` built by CI **and set to public** (GitHub → Packages → classroom-hubs → visibility) | #27 |

Files here: [`.env.example`](.env.example) · [`configure.sh`](configure.sh) (generates the CE manifest) · [`backup.sh`](backup.sh) (nightly encrypted off-site backup).
Secrets live only in `deploy/.env` and `deploy/work/`, which are git-ignored. **Back up `deploy/.env` and `deploy/work/secrets.env` to the team password manager.**

---

## Free option (experimental): Oracle Cloud Always Free + sslip.io

If there's no budget yet, you can **test** on Oracle Cloud's Always Free tier:
- **Domain:** sslip.io gives every IP a free name, and any prefix works (`assets.<ip-with-dashes>.sslip.io` etc.), so you get all four required names with no DNS setup.
- **Caveats** (checked 19 Oct 2026):
  - Oracle has reportedly **cut** the free Ampere A1 allowance from 4 CPU / 24 GB to **2 CPU / 12 GB**. Sources disagree on the date and on enforcement ([InfoQ](https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/), [TerminalBytes](https://terminalbytes.com/oracle-cloud-free-tier-changes-2026)). Check Oracle's own Always Free page before relying on it.
  - It's an **ARM** machine. Every CE image (reticulum, dialog, coturn, haproxy, spoke…) must have an `arm64` build. **Unverified.**
  - 2 CPUs is tight for the media server, which is fine for a 5–8 person test but not for a class.
  - Signing up needs a card for identity verification.
- Use it to rehearse this runbook. **Use the paid server below for the pilot.**

## 1. Create the server

- **Hetzner Cloud → Singapore (sin) → CCX33**: 8 dedicated vCPU, 32 GB RAM, 240 GB disk, Ubuntu 24.04, your SSH key.
- **Cloud Firewall** (Hetzner console), inbound:

| Port | Protocol | Source | Purpose |
| :--- | :--- | :--- | :--- |
| 22 | TCP | **your office IP only** | SSH |
| 80, 443 | TCP | any | HTTPS (and the certificate challenge) |
| 4443 | TCP | any | Dialog (WebRTC signalling) |
| 5349 | TCP | any | TURN over TLS (coturn) |
| 35000–60000 | UDP | any | WebRTC media |

## 2. Prepare the OS

```bash
ssh root@<server-ip>
apt update && apt -y full-upgrade && apt -y install git curl unattended-upgrades fail2ban gnupg rclone
dpkg-reconfigure -plow unattended-upgrades          # automatic security updates
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt -y install nodejs
```

## 3. Install K3s (without Traefik; CE brings its own HAProxy ingress)

```bash
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable=traefik" sh -
echo 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml' >> ~/.bashrc && export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
kubectl get nodes                                    # STATUS = Ready
kubectl get storageclass                             # "local-path" must be listed
```

## 4. Generate the configuration

```bash
git clone https://github.com/Ben010618/classroom-platform.git /opt/classroom-platform
cd /opt/classroom-platform/deploy
cp .env.example .env && nano .env                   # domain, admin email, SMTP
bash configure.sh                                    # refuses to run while placeholders remain
```

`configure.sh` clones `hubs-cloud` at the **pinned commit** (`HUBS_CLOUD_REF`), writes `input-values.yaml` with **random secrets** (generated once and reused on every run), points `OVERRIDE_HUBS_IMAGE` at **our** client, and generates `hcce.yaml`. Nothing is applied to the cluster yet.

## 5. Apply and point DNS

```bash
cd /opt/classroom-platform/deploy/work/hubs-cloud/community-edition
npm run apply                                        # prints the load balancer IP
kubectl get pods -n hcce -w                          # wait until all are Running (5–10 min the first time)
```

At your DNS provider, create four **A records** pointing at the server's public IP:
`<domain>`, `assets.<domain>`, `stream.<domain>`, `cors.<domain>`.

## 6. HTTPS certificates

```bash
npm run gen-ssl                                      # Let's Encrypt via CE's certbotbot (retry if the namespace isn't ready)
nano hcce.yaml                                       # comment out:  - --default-ssl-certificate=hcce/cert-hcce
npm run apply
```

Open `https://<domain>`. You should get a valid certificate and the Hubs home page.

## 7. First login and the classroom room

1. Sign in with `ADM_EMAIL` (magic link by email). The first account to sign in with the admin email becomes the admin.
2. **Admin panel → App settings → Rooms** (names from `hubs/src/schema.toml`): **Disable room creation** = on · **Permissive Rooms** = off · **Default room size** = 35 · **Maximum room size** = 35. Leave **Require accounts for room access** off, because learners join as guests (BLUEPRINT §6).
3. Create the pilot room. In **Room settings**: entry = invite only; member permissions: voice on, text chat on, **spawn/draw/pin off**.
4. Promote each teacher to **moderator** (People → teacher → Promote). Only moderators see the Teacher button.
5. Once the scene from Phase 2 exists, upload it and set it as the room's scene (#11).

## 8. Point the device check page at our server (#8)

In `tools/smoke-test/config.js`, set `pingUrl: "https://<domain>/"` and republish Pages (see the root README).
The relay checks stay "not configured": CE's coturn uses **rotating credentials** that only Reticulum hands to clients inside a room, so a static page can't test the relay. Use the in-room test in step 9 instead.

## 9. Gate 1 tests (#9, #10)

Run each test from **(a)** the budget Android phone on prepaid mobile data and **(b)** a lab laptop on the school network:

| Test | How | Pass |
| :--- | :--- | :--- |
| Join | Open the room link → Join → Enter | In the room within 30 s |
| Voice, normal path | Talk with a second device | Clear audio both ways |
| **Voice through the TURN relay (TLS 5349)** | Open the room with **`?force_tcp=1`** appended to the URL. Hubs then sends media only via TURN over TLS. | Clear audio. **If this fails on the school network, see finding F1 below.** |
| Mobile data per student (#9) | Android: Settings → Network → Data usage, noted before/after 15 min in Lecture Mode, then 15 min of open discussion with 5+ people | Fill in the BLUEPRINT §5.2 table |
| Teacher tools | Teacher button → Lecture Mode / Gather / Seat Lock with 3+ learner devices | Learners muted, seated, locked |

## 10. Backups (nightly, encrypted, off-site)

```bash
rclone config                                        # add e.g. a Hetzner Object Storage (S3) remote
cat >> /opt/classroom-platform/deploy/.env <<'EOF'
BACKUP_PASSPHRASE=<long random string — store it in the password manager>
BACKUP_REMOTE=<remote>:classroom-backups
BACKUP_KEEP_DAYS=14
EOF
chmod +x /opt/classroom-platform/deploy/backup.sh && /opt/classroom-platform/deploy/backup.sh     # test once
( crontab -l 2>/dev/null; echo "30 2 * * * /opt/classroom-platform/deploy/backup.sh >> /var/log/classroom-backup.log 2>&1" ) | crontab -
```

**Restore drill (required before the pilot, #22):** download an archive, `gpg -d … | tar -xz` into `community-edition/data_backups/`, then `npm run restore-backup <folder>`. Check that rooms and scenes come back.

## 11. Updating

| What | How |
| :--- | :--- |
| Our client (after merging to `main`) | CI publishes a new `:latest` → `kubectl rollout restart deployment/hubs -n hcce` |
| Upstream CE services | Bump `HUBS_CLOUD_REF` in `.env`, `bash configure.sh`, review `git diff` of `hcce.yaml`, then `npm run apply`. Do it in the monthly maintenance window, outside school hours. |
| OS | Automatic security updates. Reboot monthly in the maintenance window. |

---

## Findings from reading the CE code (verify during Gate 1)

**F1. TURN listens on port 5349, not 443.** CE runs coturn on TCP **5349** on the same IP as HTTPS (443), and Reticulum tells clients to use `turns:<stream-host>:5349` (`naf-dialog-adapter.js` `getIceServers`). Networks that only allow 80/443 will block it.
*If `?force_tcp=1` fails on the school network:* add a **second public IP** (Hetzner Primary IP, ~€1/month), run coturn's TLS listener on `IP2:443`, and make a small client patch to use a separate TURN hostname (`turn.<domain>` → IP2). This is tracked as an issue; only build it if Gate 1 shows it's needed.

**F2. The Hubs client always adds Google's public STUN server** (`stun1.l.google.com`) to its ICE servers. That sends each learner's IP address to a third party, against BLUEPRINT §6. Our SFU (Dialog/mediasoup) has a public IP, so clients most likely **don't need STUN at all**. Proposed fix: a small client patch to drop it. Verify with Gate 1 tests that voice still works from mobile data and the school network without it.
