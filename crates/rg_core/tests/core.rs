use rg_core::input::Input;
use rg_core::json::{self, Json};
use rg_core::rng::Rng;
use rg_core::vfs::{self, Vfs};

#[test]
fn json_round_trip() {
    let src = r#"{"a":1,"b":[true,false,null,"x\"y\n"],"c":{"d":-2.5e1,"e":"ä😀"},"f":"ä😀"}"#;
    let v = json::parse(src);
    assert_eq!(v.get("a").as_num(0.0), 1.0);
    assert_eq!(v.get("b").items().len(), 4);
    assert_eq!(v.get("c").get("d").as_num(0.0), -25.0);
    assert_eq!(v.get("c").get("e").as_str(), "ä😀");
    assert_eq!(v.get("f").as_str(), "ä😀");
    let again = json::parse(&v.write());
    assert_eq!(again.write(), v.write());
}

#[test]
fn json_errors() {
    let mut r = json::JsonReader::new("{\"a\":}");
    let v = r.parse();
    assert!(v.is_null());
    assert!(!r.error.is_empty());
    assert!(matches!(json::parse("[1,2"), Json::Null));
}

#[test]
fn vfs_paths_and_packs() {
    assert_eq!(vfs::normalize("a/./b/../c/"), "/a/c");
    assert_eq!(vfs::join("/games/x", "../y/z.png"), "/games/y/z.png");
    assert_eq!(vfs::dirname("/a/b.txt"), "/a");
    assert_eq!(vfs::extension("x/Y.PNG"), "png");
    let mut v = Vfs::new();
    v.add_text("/p/game.json", "{}");
    v.add("/p/img/a.png", vec![0, 1, 2, 10, 255]);
    let pack = v.pack("/p");
    let mut w = Vfs::new();
    assert_eq!(w.mount_pack("/games/q", &pack), 2);
    assert_eq!(w.read("/games/q/img/a.png"), vec![0, 1, 2, 10, 255]);
    assert_eq!(w.list("/games/q"), vec!["game.json".to_string(), "img/".to_string()]);
    assert!(!w.write_text("/games/q/game.json", "x"));
    assert!(w.write_text("/save/q.json", "{\"best\":3}"));
    assert_eq!(w.take_dirty(), vec!["/save/q.json".to_string()]);
    assert_eq!(w.mount_pack("/x", &b"nope".to_vec()), -1);
}

#[test]
fn rng_is_the_same_everywhere() {
    let mut r = Rng::new(42);
    let a: Vec<i64> = (0..4).map(|_| r.next_int()).collect();
    // the values every Ranger target must give for seed 42
    assert_eq!(a, vec![2027382, 1226992407, 551494037, 961371815]);
    let mut r2 = Rng::new(7);
    for _ in 0..100 {
        let n = r2.range(3, 6);
        assert!((3..=6).contains(&n));
    }
}

#[test]
fn input_events() {
    let mut i = Input::new();
    i.pointer_down(1, 10.0, 20.0);
    i.key_down("ArrowLeft");
    assert!(i.state_json().contains("\"ArrowLeft\":true"));
    i.pointer_up(1, 12.0, 20.0);
    i.key_up("ArrowLeft");
    assert_eq!(i.take_events().len(), 4);
    assert!(i.pointers.is_empty());
    assert!(i.take_events().is_empty());
}
