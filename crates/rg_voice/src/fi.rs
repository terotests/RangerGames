// SPDX-License-Identifier: AGPL-3.0-or-later
//! Finnish text → IPA for CHIMERA.
//!
//! Finnish is written almost as it is said, so the rules are short: one
//! sound per letter, a doubled letter is a long sound (`tuuli` → tuːli,
//! `kissa` → kisːɑ), `ng` is a long velar nasal (`kengät` → keŋːæt), `n`
//! before `k` is velar (`kenkä` → keŋkæ), and the stress is always on the
//! first syllable of the word. Numbers 0–999 are spelled out.

/// One phrase of a sentence: its IPA and whether it is a question.
pub struct Phrase {
    pub ipa: String,
    pub question: bool,
}

fn sound(c: char) -> Option<&'static str> {
    Some(match c {
        'a' => "ɑ",
        'e' => "e",
        'i' => "i",
        'o' => "o",
        'u' => "u",
        'y' => "y",
        'ä' => "æ",
        'ö' => "ø",
        'å' => "o",
        'b' => "b",
        'c' => "k",
        'd' => "d",
        'f' => "f",
        'g' => "g",
        'h' => "h",
        'j' => "j",
        'k' => "k",
        'l' => "l",
        'm' => "m",
        'n' => "n",
        'p' => "p",
        'q' => "k",
        'r' => "r",
        's' => "s",
        't' => "t",
        'v' | 'w' => "ʋ",
        'x' => "ks",
        'z' => "ts",
        'š' => "ʃ",
        'ž' => "ʒ",
        _ => return None,
    })
}

const ONES: [&str; 10] = ["nolla", "yksi", "kaksi", "kolme", "neljä", "viisi", "kuusi", "seitsemän", "kahdeksan", "yhdeksän"];

/// A number 0–999 in words, written as one word as Finnish does (`kaksikymmentäyksi`).
pub fn number(n: u32) -> String {
    if n < 10 {
        return ONES[n as usize].to_string();
    }
    if n == 10 {
        return "kymmenen".into();
    }
    if n < 20 {
        return format!("{}toista", ONES[(n - 10) as usize]);
    }
    if n < 100 {
        let tens = format!("{}kymmentä", ONES[(n / 10) as usize]);
        return if n % 10 == 0 { tens } else { format!("{}{}", tens, ONES[(n % 10) as usize]) };
    }
    if n < 1000 {
        let h = if n / 100 == 1 { "sata".to_string() } else { format!("{}sataa", ONES[(n / 100) as usize]) };
        return if n % 100 == 0 { h } else { format!("{}{}", h, number(n % 100)) };
    }
    n.to_string()
}

/// One word (lowercase letters) in IPA, stressed on its first syllable.
pub fn word(w: &str) -> String {
    let ch: Vec<char> = w.chars().collect();
    let mut out = String::from("ˈ");
    let mut i = 0;
    while i < ch.len() {
        let c = ch[i];
        let next = ch.get(i + 1).copied();
        if c == 'n' && next == Some('g') {
            out.push_str("ŋː");
            i += 2;
            continue;
        }
        if c == 'n' && next == Some('k') {
            out.push('ŋ');
            i += 1;
            continue;
        }
        let Some(s) = sound(c) else {
            i += 1;
            continue;
        };
        out.push_str(s);
        if next == Some(c) {
            out.push('ː');
            i += 2;
            continue;
        }
        i += 1;
    }
    out
}

/// Finnish text in IPA, one phrase per sentence (`.`, `!`, `?`); a comma is
/// a short pause inside the phrase.
pub fn to_phrases(text: &str) -> Vec<Phrase> {
    let mut phrases: Vec<Phrase> = Vec::new();
    let mut words: Vec<String> = Vec::new();
    let mut cur = String::new();
    let mut digits = String::new();
    let flush_word = |cur: &mut String, digits: &mut String, words: &mut Vec<String>| {
        if !digits.is_empty() {
            let n: u32 = digits.parse().unwrap_or(0);
            words.push(word(&number(n)));
            digits.clear();
        }
        if !cur.is_empty() {
            words.push(word(cur));
            cur.clear();
        }
    };
    for c in text.chars() {
        let lc = c.to_lowercase().next().unwrap_or(c);
        if lc.is_ascii_digit() {
            if !cur.is_empty() {
                flush_word(&mut cur, &mut digits, &mut words);
            }
            digits.push(lc);
        } else if sound(lc).is_some() {
            if !digits.is_empty() {
                flush_word(&mut cur, &mut digits, &mut words);
            }
            cur.push(lc);
        } else if lc == ',' || lc == ';' || lc == ':' {
            flush_word(&mut cur, &mut digits, &mut words);
            if !words.is_empty() {
                words.push(",".into());
            }
        } else if lc == '.' || lc == '!' || lc == '?' {
            flush_word(&mut cur, &mut digits, &mut words);
            if !words.is_empty() {
                phrases.push(Phrase { ipa: join(&words), question: lc == '?' });
                words.clear();
            }
        } else {
            // space, hyphen, quotes, emoji: a word boundary
            flush_word(&mut cur, &mut digits, &mut words);
        }
    }
    flush_word(&mut cur, &mut digits, &mut words);
    if !words.is_empty() {
        phrases.push(Phrase { ipa: join(&words), question: false });
    }
    phrases
}

fn join(words: &[String]) -> String {
    let mut s = String::new();
    for w in words {
        if w == "," {
            s.push(',');
        } else {
            if !s.is_empty() && !s.ends_with(',') {
                s.push(' ');
            }
            s.push_str(w);
        }
    }
    s.trim_end_matches(',').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn words() {
        assert_eq!(word("hyvä"), "ˈhyʋæ");
        assert_eq!(word("kissa"), "ˈkisːɑ");
        assert_eq!(word("tuuli"), "ˈtuːli");
        assert_eq!(word("kengät"), "ˈkeŋːæt");
        assert_eq!(word("kenkä"), "ˈkeŋkæ");
        assert_eq!(word("pöllö"), "ˈpølːø");
    }

    #[test]
    fn numbers() {
        assert_eq!(number(7), "seitsemän");
        assert_eq!(number(13), "kolmetoista");
        assert_eq!(number(20), "kaksikymmentä");
        assert_eq!(number(42), "neljäkymmentäkaksi");
        assert_eq!(number(115), "sataviisitoista");
    }

    #[test]
    fn sentences() {
        let p = to_phrases("Hienoa! Valitse punainen, sitten 3?");
        assert_eq!(p.len(), 2);
        assert_eq!(p[0].ipa, "ˈhienoɑ");
        assert_eq!(p[1].ipa, "ˈʋɑlitse ˈpunɑinen,ˈsitːen ˈkolme");
        assert!(p[1].question);
    }
}
