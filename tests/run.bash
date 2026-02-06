make clean
make
./bin/yap --compile ./tests/full_test.yap -o full_test.out
./full_test.out hello world compiled
#./bin/yap ./tests/full_test.yap hello world interpreted
# node ./tests/longLoopReference.js hello world gamer