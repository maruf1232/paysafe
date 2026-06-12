const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Using service role key for admin tasks
const supabase = createClient(supabaseUrl, supabaseKey);

// User functions
async function getUser(telegramId) {
    const { data, error } = await supabase.from('users').select('*').eq('telegram_id', telegramId).single();
    if (error && error.code !== 'PGRST116') console.error('Error fetching user:', error);
    return data;
}

async function createUser(telegramId, referredBy = null) {
    const { data, error } = await supabase.from('users').insert([{ telegram_id: telegramId, referred_by: referredBy }]).select().single();
    if (error) console.error('Error creating user:', error);
    return data;
}

async function updateUserBalance(telegramId, amountToAdd) {
    const user = await getUser(telegramId);
    if (!user) return null;
    const newBalance = parseFloat(user.balance) + parseFloat(amountToAdd);
    const { data, error } = await supabase.from('users').update({ balance: newBalance }).eq('telegram_id', telegramId).select().single();
    if (error) console.error('Error updating balance:', error);
    return data;
}

// Settings functions
async function getSettings() {
    const { data, error } = await supabase.from('settings').select('*').order('id', { ascending: false }).limit(1).single();
    if (error) console.error('Error fetching settings:', error);
    return data;
}

async function updateSetting(key, value) {
    const { data, error } = await supabase.from('settings').update({ [key]: value }).eq('id', 1).select().single();
    if (error) console.error('Error updating setting:', error);
    return data;
}

// Account functions
async function getAvailableAccount() {
    const { data, error } = await supabase.from('accounts').select('*').eq('is_sold', false).limit(1).single();
    if (error && error.code !== 'PGRST116') console.error('Error fetching account:', error);
    return data;
}

async function markAccountAsSold(accountId, telegramId) {
    const { data, error } = await supabase.from('accounts').update({ is_sold: true, bought_by: telegramId }).eq('id', accountId).select().single();
    if (error) console.error('Error updating account:', error);
    return data;
}

async function addAccount(email, password) {
    const { data, error } = await supabase.from('accounts').insert([{ email, password }]).select().single();
    if (error) console.error('Error adding account:', error);
    return data;
}

async function getTotalAccountsCount() {
    const { count, error } = await supabase.from('accounts').select('*', { count: 'exact', head: true });
    return count || 0;
}
async function getAvailableAccountsCount() {
    const { count, error } = await supabase.from('accounts').select('*', { count: 'exact', head: true }).eq('is_sold', false);
    return count || 0;
}

// Transaction functions
async function saveTransaction(trxId, amount, userId, method) {
    const { data, error } = await supabase.from('transactions').insert([{ trx_id: trxId, amount, user_id: userId, method }]).select().single();
    if (error) console.error('Error saving transaction:', error);
    return { data, error };
}

async function verifyTransaction(trxId) {
    const { data, error } = await supabase.from('transactions').update({ is_verified: true }).eq('trx_id', trxId).select().single();
    if (error) console.error('Error verifying transaction:', error);
    return data;
}

async function getPendingTransaction(trxId) {
    const { data, error } = await supabase.from('transactions').select('*').eq('trx_id', trxId).eq('is_verified', false).single();
    return data;
}

// Users count
async function getTotalUsersCount() {
    const { count, error } = await supabase.from('users').select('*', { count: 'exact', head: true });
    return count || 0;
}

module.exports = {
    supabase,
    getUser,
    createUser,
    updateUserBalance,
    getSettings,
    updateSetting,
    getAvailableAccount,
    markAccountAsSold,
    addAccount,
    getTotalAccountsCount,
    getAvailableAccountsCount,
    saveTransaction,
    verifyTransaction,
    getPendingTransaction,
    getTotalUsersCount
};
