// Writes EVG's closure (Ranger's runtime/rust/rangerevg/src/EVGCrate.rgr) as
// this crate's Rust module. The stubs patch what rustc or RefCell refuse in
// the Ranger Rust writer's output.
fn main() {
    ranger::build::Module::new("../../.deps/Ranger/runtime/rust/rangerevg/src/EVGCrate.rgr")
        .out_name("EVGCrate")
        // the two from rangerevg: EVGHostTextMeasurer keeps its host's
        // measuring function in an Option<Box<dyn FnMut>> that cannot be cloned
        .stub("    self.metric_fn = Some(f);\n", "    let _ = f;\n")
        .stub(
            "self.metric_fn.clone().unwrap();",
            "&mut |_: i64, _: String, _: String, _: f64, _: bool, _: bool| -> f64 { 0.0 };",
        )
        // EVGLayout::layout passes two fields of the layout as `&mut` through
        // two borrow_mut() calls at once: a RefCell double borrow at run time
        // (a Ranger Rust writer bug). Take the vectors out, pass, put back.
        .stub(
            "    EVGConnector::collect_anchors(\n      root.clone(),\n      &mut __self_rc.borrow_mut().anchor_names,\n      &mut __self_rc.borrow_mut().anchor_nodes\n    );",
            "    {\n      let mut __names = std::mem::take(&mut __self_rc.borrow_mut().anchor_names);\n      let mut __nodes = std::mem::take(&mut __self_rc.borrow_mut().anchor_nodes);\n      EVGConnector::collect_anchors(root.clone(), &mut __names, &mut __nodes);\n      __self_rc.borrow_mut().anchor_names = __names;\n      __self_rc.borrow_mut().anchor_nodes = __nodes;\n    }",
        )
        .compile();
    println!("cargo:rerun-if-changed=../../.deps/Ranger/lib/evg");
}
