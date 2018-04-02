NumPy 快速入门(2)
=============

<span id="Printing-Arrays">[打印 Arrays](#Printing-Arrays)</span>
---------------

当你打印(<span class="red">print</span>)一个 array 的时候, Numpy 会以类似嵌套列表的形式来展示它, 不过是以这样的布局:

* 最后一个轴会从左到右打印

* 倒数第二个轴会从上到下打印

* 剩下的也会从上到下打印, 各个切片之间会有一个空行隔开.

一维的 array 会打印成一行, 二维的 array 会以矩阵的形式打印, 而三维则是矩阵的列表.

```python
>>> a = np.arange(6)                         # 1d array
>>> print(a)
[0 1 2 3 4 5]
>>>
>>> b = np.arange(12).reshape(4,3)           # 2d array
>>> print(b)
[[ 0  1  2]
 [ 3  4  5]
 [ 6  7  8]
 [ 9 10 11]]
>>>
>>> c = np.arange(24).reshape(2,3,4)         # 3d array
>>> print(c)
[[[ 0  1  2  3]
  [ 4  5  6  7]
  [ 8  9 10 11]]
 [[12 13 14 15]
  [16 17 18 19]
  [20 21 22 23]]]
```

看看[这里](https://docs.scipy.org/doc/numpy-1.13.0/user/quickstart.html#quickstart-shape-manipulation)来获取更多的关于 <span class="red">reshape</span> 的信息.

如果一个 array 太大不方便打印的话, NumPy 将会自动跳过中间的部分并只打印头尾:

```python
>>> print(np.arange(10000))
[   0    1    2 ..., 9997 9998 9999]
>>>
>>> print(np.arange(10000).reshape(100,100))
[[   0    1    2 ...,   97   98   99]
 [ 100  101  102 ...,  197  198  199]
 [ 200  201  202 ...,  297  298  299]
 ...,
 [9700 9701 9702 ..., 9797 9798 9799]
 [9800 9801 9802 ..., 9897 9898 9899]
 [9900 9901 9902 ..., 9997 9998 9999]]
```

如果想要关闭这个特性并强制让 Numpy 打印整个 array, 你可以用 <span class="red">set_printoptions</span> 来改变打印选项.

```python
>>> np.setprintoptions(threshold=np.nan)
```

<span id="Basic-Operations">[基本运算](#Basic-Operations)</span>
--------------

array 的算数运算符 (Arithmetic operators) 支持 **按元素运算(elementwise)**. 一个新的 array 会由此创建并依结果填充.

```python
>>> a = np.array( [20,30,40,50] )
>>> b = np.arange( 4 )
>>> b
array([0, 1, 2, 3])
>>> c = a-b
>>> c
array([20, 29, 38, 47])
>>> b**2
array([0, 1, 4, 9])
>>> 10*np.sin(a)
array([ 9.12945251, -9.88031624,  7.4511316 , -2.62374854])
>>> a<35
array([ True, True, False, False], dtype=bool)
```

与许多矩阵语言不同的是, 积算符 * 在 Numpy arrays 中是按元素运算的. 而矩阵乘积可以用 <span class="red">dot</span> 函数或者方法来调用.

```python
>>> A = np.array( [[1,1],
...             [0,1]] )
>>> B = np.array( [[2,0],
...             [3,4]] )
>>> A*B                         # elementwise product
array([[2, 0],
       [0, 4]])
>>> A.dot(B)                    # matrix product
array([[5, 4],
       [3, 4]])
>>> np.dot(A, B)                # another matrix product
array([[5, 4],
       [3, 4]])
```

有些运算, 比如 <span class="red">+=</span> 和 <span class="red">*=</span>, 可以适当地对已存在的 array 进行修改而不是生成一个新的.

```python
>>> a = np.ones((2,3), dtype=int)
>>> b = np.random.random((2,3))
>>> a *= 3
>>> a
array([[3, 3, 3],
       [3, 3, 3]])
>>> b += a
>>> b
array([[ 3.417022  ,  3.72032449,  3.00011437],
       [ 3.30233257,  3.14675589,  3.09233859]])
>>> a += b                  # b is not automatically converted to integer type
Traceback (most recent call last):
...
TypeError: Cannot cast ufunc add output from dtype('float64') to dtype('int64') with casting rule 'same_kind'
```

当对不同类型的 arrays 进行运算的时候, 生成的 array 的类型会变得更加一般且精确 (即向上转型 (upcasting) ).

```python
>>> a = np.ones(3, dtype=np.int32)
>>> b = np.linspace(0,pi,3)
>>> b.dtype.name
'float64'
>>> c = a+b
>>> c
array([ 1.        ,  2.57079633,  4.14159265])
>>> c.dtype.name
'float64'
>>> d = np.exp(c*1j)
>>> d
array([ 0.54030231+0.84147098j, -0.84147098+0.54030231j,
       -0.54030231-0.84147098j])
>>> d.dtype.name
'complex128'
```

很多一元运算, 比如计算 array 中所有元素的和, 是作为 <span class="red">ndarray</span> 来调用的.

```python
>>> a = np.random.random((2,3))
>>> a
array([[ 0.18626021,  0.34556073,  0.39676747],
       [ 0.53881673,  0.41919451,  0.6852195 ]])
>>> a.sum()
2.5718191614547998
>>> a.min()
0.1862602113776709
>>> a.max()
0.6852195003967595
```

在默认的情况下, 这些运算会将 array 当作一个数列处理, 而不管它的 shape. 不过, 你可以通过指定 <span class="red">axis</span> 参数来指定要对哪个轴处理.

```python
>>> b = np.arange(12).reshape(3,4)
>>> b
array([[ 0,  1,  2,  3],
       [ 4,  5,  6,  7],
       [ 8,  9, 10, 11]])
>>>
>>> b.sum(axis=0)                            # sum of each column
array([12, 15, 18, 21])
>>>
>>> b.min(axis=1)                            # min of each row
array([0, 4, 8])
>>>
>>> b.cumsum(axis=1)                         # cumulative sum along each row
array([[ 0,  1,  3,  6],
       [ 4,  9, 15, 22],
       [ 8, 17, 27, 38]])
```

<span id="Universal-Functions">[通用函数](#Universal-Functions)</span>
-------------

NumPy 提供了常见的数学函数, 比如 sin, cos 或者 exp. 在 NumPy 中, 它们被称为 "通用函数"( "universal functions", <span class="red">ufunc</span>). 这些函数会按元素作用在一个 array 上, 并生成一个新的 array.

```python
>>> B = np.arange(3)
>>> B
array([0, 1, 2])
>>> np.exp(B)
array([ 1.        ,  2.71828183,  7.3890561 ])
>>> np.sqrt(B)
array([ 0.        ,  1.        ,  1.41421356])
>>> C = np.array([2., -1., 4.])
>>> np.add(B, C)
array([ 2.,  0.,  6.])
```

>了解更多:
>
>[all](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.all.html#numpy.all "numpy.all"),
[any](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.any.html#numpy.any "numpy.any"),
[apply_along_axis](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.apply_along_axis.html#numpy.apply_along_axis "numpy.apply_along_axis"),
[argmax](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.argmax.html#numpy.argmax "numpy.argmax"),
[argmin](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.argmin.html#numpy.argmin "numpy.argmin"),
[argsort](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.argsort.html#numpy.argsort "numpy.argsort"),
[average](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.average.html#numpy.average "numpy.average"),
[bincount](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.bincount.html#numpy.bincount "numpy.bincount"),
[ceil](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.ceil.html#numpy.ceil "numpy.ceil"),
[clip](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.clip.html#numpy.clip "numpy.clip"),
[conj](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.conj.html#numpy.conj "numpy.conj"),
[corrcoef](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.corrcoef.html#numpy.corrcoef "numpy.corrcoef"),
[cov](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.cov.html#numpy.cov "numpy.cov"),
[cross](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.cross.html#numpy.cross "numpy.cross"),
[cumprod](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.cumprod.html#numpy.cumprod "numpy.cumprod"),
[cumsum](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.cumsum.html#numpy.cumsum "numpy.cumsum"),
[diff](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.diff.html#numpy.diff "numpy.diff"),
[dot](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.dot.html#numpy.dot "numpy.dot"),
[floor](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.floor.html#numpy.floor "numpy.floor"),
[inner](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.inner.html#numpy.inner "numpy.inner"),
*inv*,
[lexsort](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.lexsort.html#numpy.lexsort "numpy.lexsort"),
[max](https://docs.python.org/dev/library/functions.html#max "(in Python v3.7)"),
[maximum](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.maximum.html#numpy.maximum "numpy.maximum"),
[mean](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.mean.html#numpy.mean "numpy.mean"),
[median](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.median.html#numpy.median "numpy.median"),
[min](https://docs.python.org/dev/library/functions.html#min "(in Python v3.7)"),
[minimum](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.minimum.html#numpy.minimum "numpy.minimum"),
[nonzero](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.nonzero.html#numpy.nonzero "numpy.nonzero"),
[outer](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.outer.html#numpy.outer "numpy.outer"),
[prod](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.prod.html#numpy.prod "numpy.prod"),
[re](https://docs.python.org/dev/library/re.html#module-re "(in Python v3.7)"),
[round](https://docs.python.org/dev/library/functions.html#round "(in Python v3.7)"),
[sort](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.sort.html#numpy.sort "numpy.sort"),
[std](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.std.html#numpy.std "numpy.std"),
[sum](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.sum.html#numpy.sum "numpy.sum"),
[trace](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.trace.html#numpy.trace "numpy.trace"),
[transpose](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.transpose.html#numpy.transpose "numpy.transpose"),
[var](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.var.html#numpy.var "numpy.var"),
[vdot](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.vdot.html#numpy.vdot "numpy.vdot"),
[vectorize](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.vectorize.html#numpy.vectorize "numpy.vectorize"),
[where](https://docs.scipy.org/doc/numpy-1.13.0/reference/generated/numpy.where.html#numpy.where "numpy.where")
