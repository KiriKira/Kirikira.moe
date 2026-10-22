第一次翻译文档, 难免有很多纰漏, 敬请斧正哟~并且由于太长, 就一点一点翻译啦.

原文地址: <https://docs.scipy.org/doc/numpy-1.13.0/user/quickstart.html#an-example>

快速入门
==============

<span id="Prerequisites">[先决要求](#Prerequisites)</span>
-----------

在你阅读本教程之前你应该对 Python 有所了解. 如果你想要唤醒一下你的记忆, 去看看 [Python tutorial](https://docs.python.org/3/tutorial/) 吧.

如果你想亲手试试本教程中的例子的话, 你也必须先在你的电脑上安装一些软件. 请看 <http://scipy.org/install.html> 中的说明.

<span id="The-Basics">[基础知识](#The-Basics)</span>
----------

NumPy 的主要对象是齐次高维数组(homogeneous multidimensional array). 它是一个由一些相同类型的元素(通常是数)组成的表, 由一个正整数元组来索引. 在 Numpy 中维度(dimensions)被称为 *轴(axes)* , 轴数则被称为 *阶(rank)*.

例如, 一个三维空间中的点的坐标 ```[1, 2, 1]``` 是一个一阶的序列(array), 因为它有一个轴. 这个轴的长度为 3. 下面展示的这个例子中, 这个序列的阶数为2(它有2个维度). 第一个维度(轴)的长度为2, 第二个维度的长度为3.

```python
[[1., 0., 0.],
[0., 1., 2.]]
```

NumPy 的序列类被称为 ```ndarray```. 他也有另一个常见的别名 ```array```. 请记住 ```numpy.array``` 是不同于 Python 标准库中的 ```array.array``` 类的, 后者只能处理一维的序列并且功能较少. 一个 ```ndarray``` 所具有的更重要的属性包括:

__ndarray.ndim__

* array 的轴数(维数). 在 Python 世界中, 维数通常被称为阶(rank).

__ndarray.shape__

* array 的尺寸(dimensions). 它通常是一个表示各个维度上 array 长度(size)的整数元组. 对于一个 n 行 m 列的矩阵来说, ```shape```就是 ```(n,m)```. ```shape``` 的长度就等于阶, 也就是维数, 即上面提到的```ndim```.

__ndarray.size__

* 整个 array 的元素数. 它等于 shape 中各元素的积.

__ndarray.dtype__

* 一个描述 array 中元素类型的对象. 你可以用 Python 的基本类型定义或者指定一个 dtype. 另外, NumPy 也提供自带的一些类型, 比如 ```numpy.int32```, ```numpy.int16```, ```numpy.float64```等.

__ndarray.itemsize__

* array 中每个元素的大小(size). 例如, 一个由 ```float64``` 类型的元素组成的 array, 它的 ```itemsize``` 就是 8(=64/8), 而一个由 ```complex32``` 类型组成的 array 的 ```itemsize``` 则是4(=32/8). 它就等于 ```ndarray.dtype.itemsize```.

__ndarray.data__

* 承载实际元素的缓冲区(buffer). 一般而言, 我们不需要用到这个属性, 因为我们会通过索引来访问元素.

<span id="An-example">[一个例子:](#An-example)</span>
---------------

```python
>>> import numpy as np
>>> a = np.arange(15).reshape(3, 5)
>>> a
array([[ 0,  1,  2,  3,  4],
       [ 5,  6,  7,  8,  9],
       [10, 11, 12, 13, 14]])
>>> a.shape
(3, 5)
>>> a.ndim
2
>>> a.dtype.name
'int64'
>>> a.itemsize
8
>>> a.size
15
>>> type(a)
<type 'numpy.ndarray'>
>>> b = np.array([6, 7, 8])
>>> b
array([6, 7, 8])
>>> type(b)
<type 'numpy.ndarray'>
```

<span id="Array-Creation">[创建一个 array](#Array-Creation)</span>
----------------

创建 array 有几种方式.

比如, 你可以通过 ```array``` 函数用常规的 Python 列表或者元组来创建一个 ```array```. 这样生成的 ```array``` 的类型是由序列中的元素转化得到的.

```python
>>> import numpy as np
>>> a = np.array([2,3,4])
>>> a
array([2, 3, 4])
>>> a.dtype
dtype('int64')
>>> b = np.array([1.2, 3.5, 5.1])
>>> b.dtype
dtype('float64')
```

一个常见错误是使用多个数值作为参数来调用 ```array``` 函数, 而不是提供一个由数组成的列表作为参数.

```python
>>> a = np.array(1,2,3,4)    # WRONG
>>> a = np.array([1,2,3,4])  # RIGHT
```

```array``` 函数会把序列组成的序列转化为二维的 array, 序列组成的序列组成的序列则转化为三维的 array, 以此类推.

```python
>>> b = np.array([(1.5,2,3), (4,5,6)])
>>> b
array([[ 1.5,  2. ,  3. ],
       [ 4. ,  5. ,  6. ]])
```

array 的类型也可以在创建时指定:

```python
>>> c = np.array( [ [1,2], [3,4] ], dtype=complex )
>>> c
array([[ 1.+0.j,  2.+0.j],
       [ 3.+0.j,  4.+0.j]])
```

经常我们在一开始并不知道 array 中的元素, 但是元素的大小是知道的. 因此, NumPy 提供了数个函数来创建由占位符组成的 array, 这样使得可增长 array 的必要性最小化, 而使用可增长 array 是一各代价高昂的操作.

```zeros``` 函数能创建一个全由 0 组成的 array, ```ones``` 函数能创建一个全由 1 组成的 array, 而 ```empty``` 函数的则会创建一个由内存状态生成的随机数填充的 array. 在默认的情况下, 这样创建的 array 的dtype 是 ```float64```

```python
>>> np.zeros( (3,4) )
array([[ 0.,  0.,  0.,  0.],
       [ 0.,  0.,  0.,  0.],
       [ 0.,  0.,  0.,  0.]])
>>> np.ones( (2,3,4), dtype=np.int16 )                # dtype can also be specified
array([[[ 1, 1, 1, 1],
        [ 1, 1, 1, 1],
        [ 1, 1, 1, 1]],
       [[ 1, 1, 1, 1],
        [ 1, 1, 1, 1],
        [ 1, 1, 1, 1]]], dtype=int16)
>>> np.empty( (2,3) )                                 # uninitialized, output may vary
array([[  3.73603959e-262,   6.02658058e-154,   6.55490914e-260],
       [  5.30498948e-313,   3.14673309e-307,   1.00000000e+000]])
```

为了创建一个数列, NumPy 提供了一个类似 ```range``` 的函数来返回一个 array 而不是列表(list)

```python
>>> np.arange( 10, 30, 5 )
array([10, 15, 20, 25])
>>> np.arange( 0, 2, 0.3 )                 # it accepts float arguments
array([ 0. ,  0.3,  0.6,  0.9,  1.2,  1.5,  1.8])
```

当 ```arange``` 的参数是浮点数时, 一般不可能预测得到的元素是什么, 因为浮点数的精度是有限的. 因此, 通常使用 ```linspace``` 是一个更好的选择, ```linspace``` 函数会接受我们想得到的元素数作为参数, 而不是步长(step):

```python
>>> from numpy import pi
>>> np.linspace( 0, 2, 9 )                 # 9 numbers from 0 to 2
array([ 0.  ,  0.25,  0.5 ,  0.75,  1.  ,  1.25,  1.5 ,  1.75,  2.  ])
>>> x = np.linspace( 0, 2*pi, 100 )        # useful to evaluate function at lots of points
>>> f = np.sin(x)
```

参考:

[array</span>](../reference/generated/numpy.array.html#numpy.array "numpy.array"), [zeros](../reference/generated/numpy.zeros.html#numpy.zeros "numpy.zeros"), [zeros_like](../reference/generated/numpy.zeros_like.html#numpy.zeros_like "numpy.zeros_like"), [ones](../reference/generated/numpy.ones.html#numpy.ones "numpy.ones"), [ones_like](../reference/generated/numpy.ones_like.html#numpy.ones_like "numpy.ones_like"), [empty](../reference/generated/numpy.empty.html#numpy.empty "numpy.empty"),[empty_like](../reference/generated/numpy.empty_like.html#numpy.empty_like "numpy.empty_like"), [arange](../reference/generated/numpy.arange.html#numpy.arange "numpy.arange"), [linspace](../reference/generated/numpy.linspace.html#numpy.linspace "numpy.linspace"), [numpy.random.rand](../reference/generated/numpy.random.rand.html#numpy.random.rand "numpy.random.rand"), [numpy.random.randn](../reference/generated/numpy.random.randn.html#numpy.random.randn "numpy.random.randn"), [fromfunction](../reference/generated/numpy.fromfunction.html#numpy.fromfunction "numpy.fromfunction"), [fromfile](../reference/generated/numpy.fromfile.html#numpy.fromfile "numpy.fromfile")

curl -X GET "https://api.cloudflare.com/client/v4/zones/7e27472fb9514a1b04d4d50f374cd274/ssl/verification?retry=true" \
     -H "X-Auth-Email: kiri_so@outlook.com" \
     -H "X-Auth-Key: cc1e2949f5027f8964351c9d1c257a8d2a022" \
     -H "Content-Type: application/json"