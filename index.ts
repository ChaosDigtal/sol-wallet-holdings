import { Connection, GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Client } from 'pg';
import dotenv from 'dotenv';
import { Decimal } from "decimal.js";

interface TokenData {
  id: string;
  name: string;
  symbol: string;
  quantity: Decimal;
  usd_amount: Decimal | null;
  wallet: string
}

dotenv.config();

const client = new Client({
  host: '18.188.193.193',
  database: 'postgres',
  user: 'myuser',
  password: 'Lapis@123',
  port: 5432,
});

client.connect((err) => {
  if (err) {
    console.error('Connection error', err.stack);
  } else {
    console.log('Connected to the database');
  }
});

const rpcEndpoint =
  "https://mainnet.helius-rpc.com/?api-key=35eb685f-3541-4c70-a396-7aa18696c965";
const solanaConnection = new Connection(rpcEndpoint);

const walletToQuery = "LDZ7Mq863rRSsigJBKZHihAa7vjDKHZFQLEAZCjawMQ"; // Your Wallet Address Here...

const safeNumber = (value: Decimal) => {
  if (value.isNaN() || !value.isFinite()) {
    return new Decimal(0); // or new Decimal(null), depending on your database schema
  }
  const maxPrecision = 50;
  const maxScale = 18;
  const maxValue = new Decimal('9.999999999999999999999999999999999999999999999999E+31'); // Adjust based on precision and scale
  const minValue = maxValue.negated();

  if (value.greaterThan(maxValue)) {
    return maxValue;
  }
  if (value.lessThan(minValue)) {
    return minValue;
  }
  return value;
};

async function storeDB(token_data: TokenData) {
  const query = `
    INSERT INTO wallet_holdings (
      token_id,
      token_name,
      token_symbol,
      quantity,
      usd_amount,
      wallet_id,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
  `;
  const values = [
    token_data.id,
    token_data.name,
    token_data.symbol,
    safeNumber(token_data.quantity ?? new Decimal(0)).toString(),
    safeNumber(token_data.usd_amount ?? new Decimal(0)).toString(),
    token_data.wallet,
    (new Date()).toISOString()
  ];
  try {
    await client.query(query, values);
  } catch (err) {
    console.error('Error saving event', err);
  }
}

async function getTokenAccounts(wallet: string, solanaConnection: Connection) {
  const start_time = new Date().getTime();
  const filters: GetProgramAccountsFilter[] = [
    {
      dataSize: 165, //size of account (bytes)
    },
    {
      memcmp: {
        offset: 32, //location of our query in the account (bytes)
        bytes: wallet, //our search criteria, a base58 encoded string
      },
    },
  ];
  const accounts = await solanaConnection.getParsedProgramAccounts(
    TOKEN_PROGRAM_ID, //new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
    { filters: filters }
  );
  var cnt = 0;
  var cnta = 0;
  for (const account of accounts) {
    //Parse the account data
    const parsedAccountInfo: any = account.account.data;
    const mintAddress: string = parsedAccountInfo["parsed"]["info"]["mint"];
    const tokenBalance: number =
      parsedAccountInfo["parsed"]["info"]["tokenAmount"]["uiAmount"];
    const decimals: number = parsedAccountInfo["parsed"]["info"]["tokenAmount"]["decimals"];
    //Log results
    if (decimals > 0 && tokenBalance > 0) {
      cnt += 1;
      console.log(`Token Account No. ${cnt}: ${account.pubkey.toString()}`);
      const start_time = new Date().getTime();
      var response = await fetch('https://mainnet.helius-rpc.com/?api-key=35eb685f-3541-4c70-a396-7aa18696c965', {
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "jsonrpc": "2.0",
            "id": "",
            "method": "getAsset",
            "params": {
                "id": mintAddress,
                "displayOptions": {
                    "showUnverifiedCollections": true,
                    "showCollectionMetadata": true,
                    "showFungible": true,
                    "showInscription": true
                }
            }
        }),
      })
      const data: any = await response.json();
      var token_data: TokenData;
      try {
        cnta += 1;
        token_data = {
          id: parsedAccountInfo?.parsed?.info?.mint,
          name: data?.result?.content?.metadata?.name,
          symbol: data?.result?.content?.metadata?.symbol,
          quantity: new Decimal(parsedAccountInfo?.parsed?.info?.tokenAmount?.uiAmount),
          usd_amount: new Decimal(parsedAccountInfo?.parsed?.info?.tokenAmount?.uiAmount).times(new Decimal(data?.result?.token_info?.price_info?.price_per_token)),
          wallet: walletToQuery
        } as TokenData;
      } catch {
        token_data = {
          id: parsedAccountInfo?.parsed?.info?.mint,
          name: data?.result?.content?.metadata?.name,
          symbol: data?.result?.content?.metadata?.symbol,
          quantity: new Decimal(parsedAccountInfo?.parsed?.info?.tokenAmount?.uiAmount),
          usd_amount: null,
          wallet: walletToQuery
        } as TokenData;
      }
      await storeDB(token_data);
      console.log(new Date().getTime() - start_time + "milliseconds");
    }
  };
  console.log(new Date().getTime() - start_time + "milliseconds");
}


getTokenAccounts(walletToQuery, solanaConnection);
