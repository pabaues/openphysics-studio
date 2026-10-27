(module
  (memory (export "memory") 1)
  (func (export "dot") (param $a i32) (param $b i32) (param $n i32) (result f64)
    (local $i i32) (local $sum f64)
    (block $exit
      (loop $loop
        (br_if $exit (i32.ge_u (local.get $i) (local.get $n)))
        (local.set $sum
          (f64.add (local.get $sum)
            (f64.mul
              (f64.load (i32.add (local.get $a) (i32.mul (local.get $i) (i32.const 8))))
              (f64.load (i32.add (local.get $b) (i32.mul (local.get $i) (i32.const 8)))))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)))
    (local.get $sum)))
