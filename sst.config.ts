/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "ctx",
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1",
          profile: "superbuilders-prod",
        },
      },
      removal: input.stage === "production" ? "retain" : "remove",
    };
  },

  async run() {
    // ─── Configuration ─────────────────────────────────────────
    const DOMAIN = "ctx.superbuilders.social";
    const HOSTED_ZONE_ID = "Z0217413WH5SQ3J1INC7";
    const AZ = "us-east-1a";

    // ─── VPC (reuse default VPC to avoid limit) ──────────────
    const vpc = sst.aws.Vpc.get("CtxVpc", "vpc-096e7c1841411c42d");

    // Explicit public subnet references for the default VPC
    const publicSubnetIds = [
      "subnet-013d884f57e799dca", // us-east-1a
      "subnet-0ce53d3c2be81e8e2", // us-east-1b
    ];
    const ec2SubnetId = "subnet-013d884f57e799dca"; // us-east-1a (matches EBS AZ)

    // ─── S3 Backup Bucket ──────────────────────────────────────
    const backupBucket = new sst.aws.Bucket("CtxBackups", {
      versioning: true,
    });

    // ─── Cognito User Pool ─────────────────────────────────────
    const userPool = new aws.cognito.UserPool("CtxUserPool", {
      name: `ctx-${$app.stage}`,
      autoVerifiedAttributes: ["email"],
      usernameAttributes: ["email"],
      schemas: [
        {
          name: "email",
          attributeDataType: "String",
          required: true,
          mutable: true,
        },
        {
          name: "preferred_username",
          attributeDataType: "String",
          required: false,
          mutable: true,
        },
      ],
      passwordPolicy: {
        minimumLength: 8,
        requireLowercase: true,
        requireNumbers: true,
        requireSymbols: false,
        requireUppercase: true,
      },
      accountRecoverySetting: {
        recoveryMechanisms: [
          { name: "verified_email", priority: 1 },
        ],
      },
    });

    const userPoolDomain = new aws.cognito.UserPoolDomain(
      "CtxUserPoolDomain",
      {
        domain: `ctx-app-${$app.stage}`,
        userPoolId: userPool.id,
      }
    );

    const userPoolClient = new aws.cognito.UserPoolClient(
      "CtxUserPoolClient",
      {
        name: "ctx-web",
        userPoolId: userPool.id,
        generateSecret: true,
        allowedOauthFlows: ["code"],
        allowedOauthFlowsUserPoolClient: true,
        allowedOauthScopes: ["email", "openid", "profile"],
        callbackUrls: [
          `https://${DOMAIN}/api/auth/callback/cognito`,
          "http://localhost:3000/api/auth/callback/cognito",
        ],
        logoutUrls: [`https://${DOMAIN}`, "http://localhost:3000"],
        supportedIdentityProviders: ["COGNITO"],
        explicitAuthFlows: [
          "ALLOW_REFRESH_TOKEN_AUTH",
          "ALLOW_USER_SRP_AUTH",
        ],
      }
    );

    // ─── Security Groups ───────────────────────────────────────
    const albSg = new aws.ec2.SecurityGroup("CtxAlbSg", {
      vpcId: vpc.id,
      description: "ctx ALB security group",
      ingress: [
        {
          protocol: "tcp",
          fromPort: 443,
          toPort: 443,
          cidrBlocks: ["0.0.0.0/0"],
          description: "HTTPS",
        },
        {
          protocol: "tcp",
          fromPort: 80,
          toPort: 80,
          cidrBlocks: ["0.0.0.0/0"],
          description: "HTTP redirect",
        },
      ],
      egress: [
        {
          protocol: "-1",
          fromPort: 0,
          toPort: 0,
          cidrBlocks: ["0.0.0.0/0"],
        },
      ],
      tags: { Name: `ctx-alb-sg-${$app.stage}` },
    });

    const ec2Sg = new aws.ec2.SecurityGroup("CtxEc2Sg", {
      vpcId: vpc.id,
      description: "ctx EC2 instance security group",
      ingress: [
        {
          protocol: "tcp",
          fromPort: 22,
          toPort: 22,
          cidrBlocks: ["0.0.0.0/0"],
          description: "SSH access",
        },
        {
          protocol: "tcp",
          fromPort: 3000,
          toPort: 3000,
          securityGroups: [albSg.id],
          description: "Next.js from ALB",
        },
      ],
      egress: [
        {
          protocol: "-1",
          fromPort: 0,
          toPort: 0,
          cidrBlocks: ["0.0.0.0/0"],
        },
      ],
      tags: { Name: `ctx-ec2-sg-${$app.stage}` },
    });

    // ─── IAM Role for EC2 ──────────────────────────────────────
    const ec2Role = new aws.iam.Role("CtxEc2Role", {
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Action: "sts:AssumeRole",
            Principal: { Service: "ec2.amazonaws.com" },
            Effect: "Allow",
          },
        ],
      }),
      tags: { Name: `ctx-ec2-role-${$app.stage}` },
    });

    // SSM for instance management
    new aws.iam.RolePolicyAttachment("CtxEc2Ssm", {
      role: ec2Role.name,
      policyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
    });

    // S3 access for backups
    new aws.iam.RolePolicy("CtxEc2S3Policy", {
      role: ec2Role.id,
      policy: backupBucket.name.apply((bucketName) =>
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "s3:PutObject",
                "s3:GetObject",
                "s3:ListBucket",
                "s3:DeleteObject",
              ],
              Resource: [
                `arn:aws:s3:::${bucketName}`,
                `arn:aws:s3:::${bucketName}/*`,
              ],
            },
          ],
        })
      ),
    });

    // CloudWatch logs
    new aws.iam.RolePolicyAttachment("CtxEc2CloudWatch", {
      role: ec2Role.name,
      policyArn:
        "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
    });

    const instanceProfile = new aws.iam.InstanceProfile("CtxEc2Profile", {
      role: ec2Role.name,
    });

    // ─── AMI Lookup ────────────────────────────────────────────
    const ami = await aws.ec2.getAmi({
      mostRecent: true,
      filters: [
        {
          name: "name",
          values: [
            "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*",
          ],
        },
        { name: "virtualization-type", values: ["hvm"] },
      ],
      owners: ["099720109477"], // Canonical
    });

    // ─── EBS Data Volume ───────────────────────────────────────
    const dataVolume = new aws.ebs.Volume("CtxDataVolume", {
      availabilityZone: AZ,
      size: 100,
      type: "gp3",
      encrypted: true,
      tags: { Name: `ctx-data-${$app.stage}` },
    });

    // ─── User Data Script ──────────────────────────────────────
    const userData = $interpolate`#!/bin/bash
set -euo pipefail
exec > /var/log/ctx-bootstrap.log 2>&1

echo "========================================"
echo "  ctx bootstrap — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "========================================"

# ── Wait for and mount EBS data volume ────────────────────
echo "[1/8] Mounting EBS data volume..."
ATTEMPTS=0
while [ ! -e /dev/nvme1n1 ] && [ $ATTEMPTS -lt 60 ]; do
  sleep 2
  ATTEMPTS=$((ATTEMPTS + 1))
done
if [ ! -e /dev/nvme1n1 ]; then
  echo "ERROR: EBS volume not found at /dev/nvme1n1 after 120s"
  exit 1
fi

if ! blkid /dev/nvme1n1 > /dev/null 2>&1; then
  echo "Formatting EBS volume..."
  mkfs.ext4 -L ctx-data /dev/nvme1n1
fi

mkdir -p /srv/ctx
mount /dev/nvme1n1 /srv/ctx
grep -q '/srv/ctx' /etc/fstab || \
  echo 'LABEL=ctx-data /srv/ctx ext4 defaults,nofail 0 2' >> /etc/fstab
echo "  ✓ EBS volume mounted at /srv/ctx"

# ── Initialize directory structure ────────────────────────
echo "[2/8] Initializing filesystem layout..."
mkdir -p /srv/ctx/{home,teams,var/{search,ingest,backups,log,keys}}
chmod 755 /srv/ctx /srv/ctx/home /srv/ctx/teams
chmod 750 /srv/ctx/var

# Create user-map file if it doesn't exist
[ -f /srv/ctx/var/user-map.json ] || echo '{}' > /srv/ctx/var/user-map.json
[ -f /srv/ctx/var/teams.yaml ] || cat > /srv/ctx/var/teams.yaml << 'TEAMEOF'
teams: []
TEAMEOF
echo "  ✓ Directory structure initialized"

# ── Install system dependencies ───────────────────────────
echo "[3/8] Installing system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  openssh-server git ripgrep acl jq sqlite3 \
  inotify-tools curl unzip python3-pip
echo "  ✓ System packages installed"

# ── Install Node.js 22 ───────────────────────────────────
echo "[4/8] Installing Node.js 22..."
if ! command -v node &> /dev/null || ! node --version | grep -q "v22"; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
echo "  Node.js $(node --version), npm $(npm --version)"
echo "  ✓ Node.js installed"

# ── Create service user ──────────────────────────────────
echo "[5/8] Creating service user..."
id ctx-web &>/dev/null || useradd -r -s /bin/false -d /opt/ctx-web ctx-web
mkdir -p /opt/ctx-web
chown ctx-web:ctx-web /opt/ctx-web
echo "  ✓ Service user created"

# ── Configure SSH ─────────────────────────────────────────
echo "[6/8] Configuring SSH..."
cat > /etc/ssh/sshd_config.d/ctx.conf << 'SSHCONF'
# ctx SSH configuration
AuthorizedKeysCommand /usr/local/bin/ctx-ssh-keys %u
AuthorizedKeysCommandUser nobody
AllowAgentForwarding no
PermitRootLogin prohibit-password
PasswordAuthentication no
SSHCONF
systemctl restart ssh
echo "  ✓ SSH configured"

# ── Install provisioning scripts ─────────────────────────
echo "[7/8] Installing ctx scripts..."
# These are deployed via deploy-web.sh; create stubs for now
cat > /usr/local/bin/ctx-ssh-keys << 'KEYSCRIPT'
#!/bin/bash
# ctx SSH authorized keys lookup
# Usage: ctx-ssh-keys <username>
USERNAME="$1"
KEYS_DIR="/srv/ctx/var/keys"
KEY_FILE="$KEYS_DIR/$USERNAME/authorized_keys"
if [ -f "$KEY_FILE" ]; then
  cat "$KEY_FILE"
fi
KEYSCRIPT
chmod 755 /usr/local/bin/ctx-ssh-keys

cat > /usr/local/bin/ctx-provision << 'PROVISION'
#!/bin/bash
# ctx user provisioning
# Usage: ctx-provision <username> <email> [preferred_name]
set -euo pipefail

USERNAME="$1"
EMAIL="$2"
PREFERRED_NAME="$3"
[ -z "$PREFERRED_NAME" ] && PREFERRED_NAME="$USERNAME"
CTX_ROOT="/srv/ctx"

# Create Unix user if not exists
if ! id "$USERNAME" &>/dev/null; then
  useradd -m -d "$CTX_ROOT/home/$USERNAME" -s /bin/bash "$USERNAME"
  echo "Created user: $USERNAME"
fi

HOME_DIR="$CTX_ROOT/home/$USERNAME"

# Create directory structure
mkdir -p "$HOME_DIR"/{.profile,contexts,logs,notes,pub/{contexts,logs}}
chmod 700 "$HOME_DIR"
chmod 750 "$HOME_DIR/pub"

# Initialize contexts as git repo
if [ ! -d "$HOME_DIR/contexts/.git" ]; then
  cd "$HOME_DIR/contexts"
  git init -q
  git config user.name "$PREFERRED_NAME"
  git config user.email "$EMAIL"
fi

# Create profile documents
if [ ! -f "$HOME_DIR/.profile/identity.md" ]; then
  cat > "$HOME_DIR/.profile/identity.md" << EOF
---
field: identity
updated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
---

- **Name:** $PREFERRED_NAME
- **Email:** $EMAIL
EOF
fi

# Create SSH keys directory
mkdir -p "$CTX_ROOT/var/keys/$USERNAME"
chmod 700 "$CTX_ROOT/var/keys/$USERNAME"

# Set ownership
chown -R "$USERNAME:$USERNAME" "$HOME_DIR"
chown -R "$USERNAME:$USERNAME" "$CTX_ROOT/var/keys/$USERNAME"

echo "Provisioned user: $USERNAME ($EMAIL)"
PROVISION
chmod 755 /usr/local/bin/ctx-provision
echo "  ✓ Scripts installed"

# ── Write environment configuration ──────────────────────
echo "[8/8] Writing configuration..."
cat > /opt/ctx-web/.env << ENVEOF
# ctx web application configuration
NODE_ENV=production
PORT=3000
CTX_ROOT=/srv/ctx

# Cognito
COGNITO_USER_POOL_ID=${userPool.id}
COGNITO_CLIENT_ID=${userPoolClient.id}
COGNITO_CLIENT_SECRET=${userPoolClient.clientSecret}
COGNITO_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/${userPool.id}
COGNITO_DOMAIN=https://${userPoolDomain.domain}.auth.us-east-1.amazoncognito.com

# Auth
NEXTAUTH_URL=https://${DOMAIN}
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# S3 Backup
BACKUP_BUCKET=${backupBucket.name}
ENVEOF
chmod 600 /opt/ctx-web/.env
echo "  ✓ Configuration written"

# ── Create systemd service ────────────────────────────────
cat > /etc/systemd/system/ctx-web.service << 'SVCEOF'
[Unit]
Description=ctx web application
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ctx-web/app
EnvironmentFile=/opt/ctx-web/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
StandardOutput=append:/srv/ctx/var/log/ctx-web.log
StandardError=append:/srv/ctx/var/log/ctx-web.log

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable ctx-web

echo "========================================"
echo "  ctx bootstrap COMPLETE"
echo "  Web app will start after deploy-web.sh"
echo "========================================"
`;

    // ─── EC2 Instance ──────────────────────────────────────────
    const subnetId = ec2SubnetId;

    const instance = new aws.ec2.Instance("CtxHost", {
      ami: ami.id,
      instanceType: "t3.medium",
      subnetId: subnetId,
      vpcSecurityGroupIds: [ec2Sg.id],
      iamInstanceProfile: instanceProfile.name,
      userData: userData,
      userDataReplaceOnChange: false,
      rootBlockDevice: {
        volumeSize: 20,
        volumeType: "gp3",
        encrypted: true,
      },
      tags: { Name: `ctx-host-${$app.stage}` },
    });

    // Attach EBS data volume
    new aws.ec2.VolumeAttachment("CtxDataAttachment", {
      instanceId: instance.id,
      volumeId: dataVolume.id,
      deviceName: "/dev/sdf",
    });

    // Elastic IP for stable SSH access
    const eip = new aws.ec2.Eip("CtxEip", {
      instance: instance.id,
      tags: { Name: `ctx-eip-${$app.stage}` },
    });

    // ─── ACM Certificate ───────────────────────────────────────
    const cert = new aws.acm.Certificate("CtxCert", {
      domainName: DOMAIN,
      validationMethod: "DNS",
      tags: { Name: `ctx-cert-${$app.stage}` },
    });

    // DNS validation record
    const certValidationRecord = new aws.route53.Record(
      "CtxCertValidation",
      {
        zoneId: HOSTED_ZONE_ID,
        name: cert.domainValidationOptions.apply(
          (opts) => opts[0].resourceRecordName
        ),
        type: cert.domainValidationOptions.apply(
          (opts) => opts[0].resourceRecordType
        ),
        records: [
          cert.domainValidationOptions.apply(
            (opts) => opts[0].resourceRecordValue
          ),
        ],
        ttl: 60,
      }
    );

    // Wait for cert validation
    const certValidation = new aws.acm.CertificateValidation(
      "CtxCertValidated",
      {
        certificateArn: cert.arn,
        validationRecordFqdns: [certValidationRecord.fqdn],
      }
    );

    // ─── Application Load Balancer ─────────────────────────────
    const alb = new aws.lb.LoadBalancer("CtxAlb", {
      loadBalancerType: "application",
      securityGroups: [albSg.id],
      subnets: publicSubnetIds,
      tags: { Name: `ctx-alb-${$app.stage}` },
    });

    const targetGroup = new aws.lb.TargetGroup("CtxWebTg", {
      port: 3000,
      protocol: "HTTP",
      vpcId: vpc.id,
      targetType: "instance",
      healthCheck: {
        path: "/api/health",
        port: "3000",
        protocol: "HTTP",
        healthyThreshold: 2,
        unhealthyThreshold: 5,
        interval: 30,
        timeout: 10,
      },
      tags: { Name: `ctx-web-tg-${$app.stage}` },
    });

    new aws.lb.TargetGroupAttachment("CtxWebTgAttachment", {
      targetGroupArn: targetGroup.arn,
      targetId: instance.id,
      port: 3000,
    });

    // HTTPS listener (port 443)
    new aws.lb.Listener("CtxHttpsListener", {
      loadBalancerArn: alb.arn,
      port: 443,
      protocol: "HTTPS",
      certificateArn: certValidation.certificateArn,
      defaultActions: [
        {
          type: "forward",
          targetGroupArn: targetGroup.arn,
        },
      ],
    });

    // HTTP → HTTPS redirect (port 80)
    new aws.lb.Listener("CtxHttpListener", {
      loadBalancerArn: alb.arn,
      port: 80,
      protocol: "HTTP",
      defaultActions: [
        {
          type: "redirect",
          redirect: {
            port: "443",
            protocol: "HTTPS",
            statusCode: "HTTP_301",
          },
        },
      ],
    });

    // ─── Route53 DNS Records ───────────────────────────────────
    // Web access via ALB
    new aws.route53.Record("CtxWebDns", {
      zoneId: HOSTED_ZONE_ID,
      name: DOMAIN,
      type: "A",
      aliases: [
        {
          name: alb.dnsName,
          zoneId: alb.zoneId,
          evaluateTargetHealth: true,
        },
      ],
    });

    // SSH access via EIP (ssh.ctx.superbuilders.social)
    new aws.route53.Record("CtxSshDns", {
      zoneId: HOSTED_ZONE_ID,
      name: `ssh.${DOMAIN}`,
      type: "A",
      ttl: 60,
      records: [eip.publicIp],
    });

    // ─── Outputs ───────────────────────────────────────────────
    return {
      url: `https://${DOMAIN}`,
      sshHost: $interpolate`ssh.${DOMAIN}`,
      sshCommand: $interpolate`ssh ubuntu@${eip.publicIp}`,
      instanceId: instance.id,
      publicIp: eip.publicIp,
      backupBucket: backupBucket.name,
      cognitoUserPoolId: userPool.id,
      cognitoClientId: userPoolClient.id,
      cognitoDomain: $interpolate`https://${userPoolDomain.domain}.auth.us-east-1.amazoncognito.com`,
    };
  },
});
