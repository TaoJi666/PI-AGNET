---
title: 在本地运行 Milvus Lite
source: https://milvus.io/docs/zh/milvus_lite.md
version: v3.0.x
---

> 本文来自 Milvus 官方文档，版本 v3.0.x。原文：<https://milvus.io/docs/zh/milvus_lite.md>。文档仓库 [milvus-io/milvus-docs](https://github.com/milvus-io/milvus-docs) 使用 Apache License 2.0。文中指向其他章节的链接仍回到官网。

<a id="Run-Milvus-Lite-Locally"></a>

# 在本地运行 Milvus Lite

本页面介绍了如何使用 Milvus Lite 进行本地向量搜索。内容涵盖安装、数据持久化、过滤以及将数据导出到另一个 Milvus 部署。

<a id="Overview"></a>

## 概述

Milvus Lite 是[Milvus Python SDK](https://github.com/milvus-io/pymilvus) 的轻量级本地后端。请通过可选的`milvus-lite` 附加组件进行安装；仅安装`pymilvus` 并不会在下面使用的 SDK 版本中安装此后端。

Milvus Lite 适用于以下环境中的本地开发和小规模工作负载：

- Jupyter Notebook 或 Google Colab
- 笔记本电脑
- 具备兼容 Python 依赖项的边缘设备

Milvus Lite 使用`MilvusClient` API 执行受支持的操作，包括向量数据持久化、插入和删除、向量搜索以及元数据过滤。若要将受支持的应用程序工作流迁移到远程部署环境，请更改连接 URI 和凭据，并查看受支持功能的差异。 对于大规模生产工作负载，请使用[Milvus Standalone 或 Milvus Distributed](https://milvus.io/docs/zh/install-overview.md)，或[Zilliz Cloud](https://zilliz.com/cloud) 上的全托管 Milvus。

<a id="Prerequisites"></a>

## 先决条件

本指南使用 PyMilvus **3.0.2** 和 Milvus Lite **3.2.2**。请准备以下环境：

- Python 3.10 或更高版本。本地 Lite 后端对 Python 版本的最低要求高于远程 PyMilvus 客户端。
- macOS、Linux 或 Windows 系统，并具备兼容的依赖项轮子（如`faiss-cpu` 和`pyarrow` ）。Milvus Lite 3.2.2 是一个纯 Python 包，因此操作系统和架构必须满足这些依赖项的要求，而非 Lite 包本身的要求。
- 用于数据库存储的可写本地目录。

在 Windows 系统上，由于其平台标记，pip 会跳过 PyMilvus 3.0.2 中的`milvus-lite` 附加项，因此必须显式指定`milvus-lite` 。下面的安装命令已包含此操作。对于其他软件包和平台的组合，请参阅[Milvus Lite 发布要求](https://github.com/milvus-io/milvus-lite/blob/v3.2.2/README.md#requirements)。

<a id="Set-up-Milvus-Lite"></a>

## 设置 Milvus Lite

创建一个隔离的 Python 环境并安装这两个包：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install "pymilvus[milvus-lite]==3.0.2" "milvus-lite==3.2.2"
```

请为 extras 表达式添加引号，以免 zsh 等 shell 解释其中的方括号。在 Windows PowerShell 中，请使用`.venv\Scripts\Activate.ps1` 而不是`source .venv/bin/activate` 来激活环境。明确指定版本号可确保 SDK 和本地后端与本指南保持一致。

Milvus Lite 3.x 使用的存储引擎与原始 2.x 包不同。它无法就地打开现有的 2.x`.db` 文件。 请保留原始数据库及能够打开它的环境，将数据导出到该环境，然后将数据导入新数据库。安装新软件包不会迁移旧的存储格式。请参阅《[从 Milvus Lite 迁移数据](#Migrating-data-from-Milvus-Lite)》。

<a id="Connect-to-Milvus-Lite"></a>

## 连接到 Milvus Lite

向 `MilvusClient` 传递以 `.db` 结尾的本地路径：

```python
from pymilvus import MilvusClient

client = MilvusClient("./milvus_demo.db")
```

对于 Milvus Lite 3.2.2，这将在工作目录中创建一个**milvus_demo.db 目录**。该目录包含数据库的存储文件；`.db` 后缀并不表示这是一个单一的可移植文件。关闭客户端或重启应用程序后，请使用相同的路径重新打开数据库。

若要创建新数据库，请使用不同的路径。若要连接到远程 Milvus 服务器，请传入其端点和凭据：

```python
client = MilvusClient(uri="http://localhost:19530", token="username:password")
```

<a id="Run-a-local-search-example"></a>

## 运行本地搜索示例

以下示例演示了使用生成的向量进行 API 工作流。这些向量并未编码文本的含义；在构建语义搜索时，请使用 Embeddings 模型。请在新的数据库路径上运行该示例，或者在再次运行前删除现有的`demo_collection` 。

```python
from pymilvus import MilvusClient
import numpy as np

client = MilvusClient("./milvus_demo.db")
client.create_collection(
    collection_name="demo_collection",
    dimension=384  # The vectors in this example have 384 dimensions.
)

docs = [
    "Artificial intelligence was founded as an academic discipline in 1956.",
    "Alan Turing was the first person to conduct substantial research in AI.",
    "Born in Maida Vale, London, Turing was raised in southern England.",
]

# Generate reproducible example vectors, not semantic embeddings.
rng = np.random.default_rng(7)
vectors = rng.uniform(-1, 1, size=(len(docs), 384)).tolist()
data = [
    {"id": i, "vector": vectors[i], "text": docs[i], "subject": "history"}
    for i in range(len(docs))
]
res = client.insert(collection_name="demo_collection", data=data)
print(res)

# Search only records whose subject is "history".
res = client.search(
    collection_name="demo_collection",
    data=[vectors[0]],
    filter="subject == 'history'",
    limit=2,
    output_fields=["text", "subject"],
)
print(res)

# Retrieve all records that match the scalar filter, without vector ranking.
res = client.query(
    collection_name="demo_collection",
    filter="subject == 'history'",
    output_fields=["text", "subject"],
)
print(res)

# Delete one record and keep the others for the export example below.
res = client.delete(collection_name="demo_collection", ids=[2])
print(res)
client.close()
```

若您的应用程序需要从文本生成 Embeddings，请继续阅读[《快速入门》](https://milvus.io/docs/zh/quickstart.md)。您还可以探索[Milvus Bootcamp](https://github.com/milvus-io/bootcamp)中的 RAG、图像搜索和框架[集成示例](https://github.com/milvus-io/bootcamp)。

<a id="Supported-features-and-limits"></a>

## 支持的功能与限制

Milvus Lite 3.2.2 通过其本地 PyMilvus 适配器实现了 Milvus 操作子集。其[带版本号的功能参考文档](https://github.com/milvus-io/milvus-lite/blob/v3.2.2/README.md#supported-features)描述了以下功能：

| 领域 | 此 Lite 版本的支持情况 |
| --- | --- |
| 稠密和稀疏向量 | `FLOAT_VECTOR` 以及`SPARSE_FLOAT_VECTOR` |
| 向量索引 | `FLAT`、`BRUTE_FORCE` 、`IVF_FLAT` 、`IVF_SQ8` 、`HNSW` 、`HNSW_SQ` ，以及`AUTOINDEX` |
| 标量和稀疏索引 | `INVERTED` 标量索引和`SPARSE_INVERTED_INDEX` |
| 数据操作 | 插入、更新或插入、获取、查询、向量搜索和删除 |
| 搜索 | 稠密和稀疏搜索、元数据过滤器、多个向量字段以及混合搜索 |
| Collection organization | Collections、命名数据库、别名和分区（在本地适配器支持的操作范围内） |

此版本不限于`FLAT` 索引。索引的可用性和行为取决于Lite版本；请勿将原始2.x后端的限制套用到3.x引擎上。

在为应用程序选择 Lite 版本之前，请仔细阅读以下限制：

- 每次仅有一个进程可以拥有数据库存储目录。引擎通过文件锁保护该目录。
- 请对写入同一Collection的操作进行串行化处理。不支持安全地进行并发写入。
- 本地适配器并未实现所有 Milvus RPC 接口。不支持的操作将返回`UNIMPLEMENTED` ；无法进行模式修改以及分区级别的加载或释放操作。
- 不支持身份验证、用户、角色、基于角色的访问控制（RBAC）和 TLS。请勿将本地服务器暴露在不可信的网络中。
- 不支持二进制、float16、bfloat16 和 int8 向量字段，以及 Product Quantization 索引。
- Lite 专为本地工作负载设计。本地 API 兼容性无法提供分布式扩展能力，也无法提供远程部署所具备的生产环境隔离性和可用性。

在依赖本地示例中未涉及的服务器功能之前，请查阅[各版本的已知限制](https://github.com/milvus-io/milvus-lite/blob/v3.2.2/README.md#known-limitations)。

<a id="Migrating-data-from-Milvus-Lite"></a>

## 从 Milvus Lite 迁移数据

使用`milvus-lite dump` 将Collection导出为Milvus BulkWriter JSON文件。这些文件可导入到自托管的Milvus部署或Zilliz Cloud中。

在打开源数据库的环境中安装 SDK 的批量写入器依赖项：

```bash
python -m pip install "pymilvus[bulk_writer]==3.0.2"
milvus-lite dump -h
```

在另一个进程中运行该命令之前，请先关闭拥有本地数据库的 Python 应用程序。导出前一个示例中的 Collection：

```bash
milvus-lite dump -d ./milvus_demo.db -c demo_collection -p ./data_dir
```

该命令会从**milvus_demo.db 存储目录中**读取`demo_collection` ，并将导出文件写入**data_dir** 目录下。请使用[Bulk Insert](https://milvus.io/docs/zh/import-data.md)或[Zilliz Cloud 数据导入功能](https://docs.zilliz.com/docs/data-import)导入这些文件。

若要导出原始的 2.x 数据库文件，请在安装了可打开该文件的原始 Lite 版本的环境中运行 dump 工具。3.x 版的 dump 工具不会通过直接打开文件来转换旧的存储格式。请保留源数据库，直到您验证了导入的行数和搜索结果。

有关受支持的导出选项和存储格式限制，请参阅[Milvus Lite 导出参考](https://github.com/milvus-io/milvus-lite/blob/v3.2.2/README.md#dump-data)文档。

<a id="Whats-next"></a>

## 下一步

继续执行以下任务：

- [快速入门](https://milvus.io/docs/zh/quickstart.md)：生成Embeddings并运行搜索工作流。
- [单向量搜索](https://milvus.io/docs/zh/single-vector-search.md)和[混合搜索](https://milvus.io/docs/zh/multi-vector-search.md)：为您的应用程序设计查询。
- [选择部署方式](https://milvus.io/docs/zh/install-overview.md)：突破本地开发限制。
- [Attu](https://github.com/zilliztech/attu)：探索 Milvus 图形用户界面（GUI），进行远程部署。
