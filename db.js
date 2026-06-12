const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Using service role key for admin tasks
const supabase = createClient(supabaseUrl, supabaseKey);

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

async function updateUserBalance(telegramId, newBalance) {
    const { error } = await supabase.from('users').update({ balance: newBalance }).eq('telegram_id', telegramId);
    if (error) console.error('Error updating balance:', error);
}

async function getSettings() {
    const { data, error } = await supabase.from('settings').select('*').order('id', { ascending: true }).limit(1).single();
    if (error && error.code !== 'PGRST116') console.error('Error fetching settings:', error);
    return data;
}

async function updateSetting(key, value) {
    const settings = await getSettings();
    if (settings) {
        await supabase.from('settings').update({ [key]: value }).eq('id', settings.id);
    }
}

async function getAvailableAccount() {
    const { data, error } = await supabase.from('accounts').select('*').eq('is_sold', false).limit(1).single();
    return data;
}

async function markAccountAsSold(accountId, buyerId) {
    await supabase.from('accounts').update({ is_sold: true, sold_to: buyerId, sold_at: new Date() }).eq('id', accountId);
}

async function addAccount(email, password) {
    const { error } = await supabase.from('accounts').insert([{ email, password }]);
    if (error) console.error('Error adding account:', error);
}

async function saveTransaction(trxId, amount, userId, method) {
    const { data, error } = await supabase.from('transactions').insert([{ trx_id: trxId, amount, user_id: userId, method }]).select().single();
    if (error) console.error('Error saving transaction:', error);
    return { data, error };
}

async function getReferralCount(telegramId) {
    const { count } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('referred_by', telegramId);
    return count || 0;
}

async function getTotalUsersCount() {
    const { count } = await supabase.from('users').select('*', { count: 'exact', head: true });
    return count || 0;
}

async function getTotalAccountsCount() {
    const { count } = await supabase.from('accounts').select('*', { count: 'exact', head: true });
    return count || 0;
}

async function getAvailableAccountsCount() {
    const { count } = await supabase.from('accounts').select('*', { count: 'exact', head: true }).eq('is_sold', false);
    return count || 0;
}

async function getAllUserIds() {
    const { data, error } = await supabase.from('users').select('telegram_id');
    return data ? data.map(u => u.telegram_id) : [];
}

module.exports = {
    getUser,
    createUser,
    updateUserBalance,
    getSettings,
    updateSetting,
    getAvailableAccount,
    markAccountAsSold,
    addAccount,
    saveTransaction,
    getReferralCount,
    getTotalUsersCount,
    getTotalAccountsCount,
    getAvailableAccountsCount,
    getAllUserIds
};
