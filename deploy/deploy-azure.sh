#!/usr/bin/env bash
# Corre esto DENTRO de Azure Cloud Shell (bash), ya autenticado con tu cuenta.
# Antes: cd ~/facturacion  (donde se extrajo el proyecto)
set -euo pipefail

SUFFIX=$(date +%s | tail -c 6)
RG="facturacion-rg"
LOCATION="chilecentral"
DB_SERVER="facturacion-db-${SUFFIX}"
DB_NAME="facturacion"
DB_USER="appuser"
DB_PASSWORD=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16 || true)A1
PLAN="facturacion-plan"
WEBAPP="facturacion-backend-${SUFFIX}"
STORAGE="facfront${SUFFIX}"

echo "Grupo de recursos: $RG | Región: $LOCATION"

echo "==> Creando grupo de recursos..."
az group create --name "$RG" --location "$LOCATION" -o none

echo "==> Creando servidor PostgreSQL (Azure Database for PostgreSQL Flexible Server, puede tardar 5-10 min)..."
az postgres flexible-server create \
  --resource-group "$RG" \
  --name "$DB_SERVER" \
  --location "$LOCATION" \
  --admin-user "$DB_USER" \
  --admin-password "$DB_PASSWORD" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 16 \
  --public-access 0.0.0.0-255.255.255.255 \
  --yes -o none

az postgres flexible-server db create \
  --resource-group "$RG" --server-name "$DB_SERVER" --name "$DB_NAME" -o none

DB_HOST="${DB_SERVER}.postgres.database.azure.com"

echo "==> Creando plan de App Service y Web App (backend)..."
az appservice plan create --name "$PLAN" --resource-group "$RG" --location "$LOCATION" --sku B1 --is-linux -o none
az webapp create --resource-group "$RG" --plan "$PLAN" --name "$WEBAPP" --runtime "NODE:22-lts" -o none

az webapp config appsettings set --resource-group "$RG" --name "$WEBAPP" --settings \
  DB_HOST="$DB_HOST" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" DB_NAME="$DB_NAME" DB_SSL=true \
  WEBSITES_PORT=8080 PORT=8080 SCM_DO_BUILD_DURING_DEPLOYMENT=true -o none

echo "==> Empaquetando y subiendo el backend..."
cd backend
rm -f ../deploy/backend-azure.zip
zip -rq ../deploy/backend-azure.zip package.json server.js db.js
cd ..
az webapp deploy --resource-group "$RG" --name "$WEBAPP" --src-path deploy/backend-azure.zip --type zip -o none

API_URL="https://${WEBAPP}.azurewebsites.net"
echo "Backend URL: $API_URL"

echo "==> Compilando frontend..."
cd frontend
echo "VITE_API_URL=${API_URL}" > .env.production
npm install --no-fund --no-audit
npm run build
cd ..

echo "==> Creando storage y subiendo frontend..."
az storage account create --name "$STORAGE" --resource-group "$RG" --location "$LOCATION" --sku Standard_LRS -o none
az storage blob service-properties update --account-name "$STORAGE" --static-website --404-document index.html --index-document index.html -o none
az storage blob upload-batch -s frontend/dist -d '$web' --account-name "$STORAGE" -o none

FRONT_URL=$(az storage account show -n "$STORAGE" -g "$RG" --query "primaryEndpoints.web" -o tsv)

echo ""
echo "========================================"
echo " LISTO"
echo " Backend:  $API_URL"
echo " Frontend: $FRONT_URL"
echo " DB host: $DB_HOST  usuario: $DB_USER  password: $DB_PASSWORD"
echo "========================================"
mkdir -p deploy
{
  echo "Backend: $API_URL"
  echo "Frontend: $FRONT_URL"
  echo "DB_HOST=$DB_HOST"
  echo "DB_USER=$DB_USER"
  echo "DB_PASSWORD=$DB_PASSWORD"
  echo "Grupo de recursos: $RG (borrar este grupo borra todo y detiene el cobro)"
} > deploy/datos-despliegue.txt
