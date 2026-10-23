package it.gruzzolo.app;

import org.json.JSONObject;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Riconosce un pagamento (importo + negozio) nel testo di una notifica e indovina la categoria. */
public final class PaymentParser {

    private PaymentParser() {}

    /** Wallet e app di pagamento seguite sempre. */
    public static final String[] WALLETS = {
            "com.google.android.apps.walletnfcrel",   // Google Wallet
            "com.samsung.android.spay",                // Samsung Wallet
            "com.satispay.customer",                   // Satispay
            "com.paypal.android.p2pmobile",            // PayPal
            "com.revolut.revolut",                     // Revolut
            "de.number26.android",                     // N26
    };

    // importo con il simbolo dell'euro prima o dopo: "€ 62,40", "62,40 €", "62.40 EUR", "EUR 1.234,50"
    private static final Pattern AMOUNT = Pattern.compile(
            "(?:€|EUR)\\s?(\\d{1,3}(?:[.\\s]\\d{3})*(?:[.,]\\d{1,2})?)|(\\d{1,3}(?:[.\\s]\\d{3})*(?:[.,]\\d{1,2})?)\\s?(?:€|EUR)",
            Pattern.CASE_INSENSITIVE);
    private static final String M_END = "([A-Za-z0-9À-ÿ'&.\\-\\s]{2,40}?)(?:\\s+(?:il|con|in data|alle|tramite|carta|del|·)\\b|\\s+\\d{1,2}[/.\\-]\\d|[.,;:!(]|$)";
    // prima «presso / c/o / at» (i più affidabili), poi «da / su / a» solo come parole intere seguite da lettere
    private static final Pattern MERCHANT = Pattern.compile("\\b(?:presso|c/o|at)\\s+" + M_END, Pattern.CASE_INSENSITIVE);
    private static final Pattern MERCHANT2 = Pattern.compile("\\b(?:da|su|a)\\s+(?=[A-Za-zÀ-ÿ])" + M_END, Pattern.CASE_INSENSITIVE);
    private static final Pattern NOT_A_PAYMENT = Pattern.compile(
            "rimbors|accredit|ricevut|hai ricevuto|refund|received|bonifico in entrata|rifiutat|non riuscit|non autorizzat|declined|failed|annullat|saldo disponibile|estratto conto|codice|otp|password|one time|conferma l'operazione|per autorizzare|accesso",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern PAYMENT_WORDS = Pattern.compile(
            "pagamento|pagato|addebit|spesa|acquisto|transazione|operazione|autorizzat|utilizzo|carta|paid|payment|purchase|prelievo|con visa|con mastercard|•",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern GENERIC_TITLE = Pattern.compile(
            "^(google wallet|samsung wallet|wallet|pagamento.*|transazione.*|payment.*|satispay|paypal|revolut|n26|notifica.*|.*banca.*|.*fineco.*|\\+?\\d[\\d ]{4,})$",
            Pattern.CASE_INSENSITIVE);

    /** app di messaggi: da qui leggo SOLO gli SMS della banca (Fineco) */
    public static final String[] SMS_APPS = { "com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms", "com.android.messaging" };
    private static final Pattern BANK_SENDER = Pattern.compile("fineco", Pattern.CASE_INSENSITIVE);

    public static boolean isSmsApp(String pkg) { for (String s : SMS_APPS) if (s.equals(pkg)) return true; return false; }
    public static boolean isBankApp(String pkg) { return pkg != null && pkg.toLowerCase(Locale.ROOT).contains("fineco"); }
    /** SMS della banca: mittente o testo che nomina Fineco */
    public static boolean isBankSms(String title, String text) {
        return BANK_SENDER.matcher(title == null ? "" : title).find() || BANK_SENDER.matcher(text == null ? "" : text).find();
    }

    public static boolean isWallet(String pkg) {
        for (String w : WALLETS) if (w.equals(pkg)) return true;
        return false;
    }

    /** null se non sembra un pagamento in uscita. */
    public static JSONObject parse(String pkg, String title, String text, boolean strictWords) {
        String t = title == null ? "" : title.trim();
        String b = text == null ? "" : text.trim();
        String all = (t + " \n " + b);
        if (NOT_A_PAYMENT.matcher(all).find()) return null;
        if (strictWords && !PAYMENT_WORDS.matcher(all).find()) return null;
        Matcher m = AMOUNT.matcher(all);
        if (!m.find()) return null;
        String raw = m.group(1) != null ? m.group(1) : m.group(2);
        double amt = toNumber(raw);
        if (!(amt > 0) || amt > 20000) return null;

        String merchant = "";
        if (!t.isEmpty() && !GENERIC_TITLE.matcher(t).matches() && !AMOUNT.matcher(t).find()) merchant = t;
        if (merchant.isEmpty()) {
            Matcher mm = MERCHANT.matcher(b);
            if (mm.find()) merchant = mm.group(1).trim();
            else { Matcher m2 = MERCHANT2.matcher(b); if (m2.find()) merchant = m2.group(1).trim(); }
        }
        if (merchant.isEmpty()) merchant = (t.isEmpty() || GENERIC_TITLE.matcher(t).matches()) ? "Pagamento" : t;
        merchant = merchant.replaceAll("\\s+", " ");
        if (merchant.length() > 40) merchant = merchant.substring(0, 40);
        try {
            JSONObject o = new JSONObject();
            o.put("amt", Math.round(amt * 100) / 100.0);
            o.put("merchant", merchant);
            o.put("pkg", pkg);
            return o;
        } catch (Exception e) {
            return null;
        }
    }

    static double toNumber(String s) {
        s = s.replace(" ", "");
        int c = s.lastIndexOf(','), d = s.lastIndexOf('.');
        if (c > d) s = s.replace(".", "").replace(',', '.');           // 1.234,50
        else if (d > c && c >= 0) s = s.replace(",", "");              // 1,234.50
        else if (d >= 0 && s.length() - d - 1 == 3) s = s.replace(".", ""); // 1.234 (migliaia)
        try { return Double.parseDouble(s); } catch (Exception e) { return -1; }
    }

    /** categoria: prima quello che hai insegnato tu (learned: {"ESSO":"benzina"}), poi parole chiave. */
    public static String guess(String merchant, JSONObject learned) {
        String up = merchant.toUpperCase(Locale.ITALY);
        if (learned != null) {
            String k = key(merchant);
            if (learned.has(k)) return learned.optString(k);
        }
        String[][] rules = {
                {"benzina", "ESSO|ENI|AGIP|Q8|TAMOIL|SHELL|IP |API |ERG|TOTAL|REPSOL|BENZIN|CARBURANT|DISTRIBUTOR|FUEL|STAZIONE DI SERVIZIO|ENILIVE"},
                {"spesa", "ESSELUNGA|CONAD|COOP|CARREFOUR|LIDL|PAM|EUROSPIN|IPER|MD |ALDI|PENNY|TIGROS|BENNET|DESPAR|SPAR|U2|UNES|IL GIGANTE|FAMILA|CRAI|SIGMA|SUPERMERC|MARKET|ALIMENTAR"},
                {"vizio", "TABACC|TABACCHERIA|IQOS|\\bTEREA?\\b|SIGARET|SMOKE|SVAP"},
                {"fuori", "RISTORANT|PIZZER|TRATTORIA|OSTERIA|BAR |CAFF|MCDONALD|BURGER|KFC|SUSHI|KEBAB|PANETTER|GELATER|DELIVEROO|GLOVO|JUST EAT|AUTOGRILL|POKE"},
                {"salute", "FARMACI|PARAFARM|MEDIC|DENTIST|OTTIC|SANIT"},
                {"shopping", "AMAZON|ZALANDO|ZARA|H&M|DECATHLON|PRIMARK|MEDIAWORLD|UNIEURO|IKEA|SHEIN|NIKE|ADIDAS|OVS|COIN"},
                {"weekend", "CINEMA|DISCO|PUB|BIRRER|TICKET|CONCERT|TEATRO|BOWLING|ESCAPE"},
                {"abbon", "NETFLIX|SPOTIFY|DISNEY|PRIME VIDEO|DAZN|NOW TV|YOUTUBE|APPLE.COM|GOOGLE \\*|PALESTRA|GYM|FITNESS"},
                {"casavarie", "ACQUA E SAPONE|TIGOTA|DM |ACTION|BRICO|LEROY|OBI "},
                {"telefono", "TIM |VODAFONE|WINDTRE|ILIAD|FASTWEB|HO\\.|KENA|VERY MOBILE"},
        };
        for (String[] r : rules) {
            if (Pattern.compile("(^|\\b|\\s)(" + r[1] + ")").matcher(up + " ").find()) return r[0];
        }
        return "";
    }

    /** chiave stabile del negozio per ricordare la categoria (maiuscolo, senza numeri di punto vendita) */
    public static String key(String merchant) {
        return merchant.toUpperCase(Locale.ITALY).replaceAll("[0-9#*]+", " ").replaceAll("[^A-Z&' ]", " ").replaceAll("\\s+", " ").trim();
    }
}
