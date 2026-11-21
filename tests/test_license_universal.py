# -*- coding: utf-8 -*-
"""通用授权（machine=*）与打包版试用策略回归。

运行：python tests/test_license_universal.py
"""
import datetime
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import license_key  # noqa: E402

results = []


def check(name, cond, detail=''):
    results.append(bool(cond))
    print(('PASS' if cond else 'FAIL'), '-', name, ('| ' + str(detail)) if detail else '')


def write_license(d, rec):
    with open(os.path.join(d, 'license.json'), 'w', encoding='utf-8') as f:
        json.dump(rec, f, ensure_ascii=False)


def payload(**kw):
    d = {
        'v': 1, 'trial': False, 'org': '东华大学', 'edition': '标准版',
        'issued': datetime.date.today().isoformat(),
        'expires': (datetime.date.today() + datetime.timedelta(days=365)).isoformat(),
        'machine': '*', 'max_users': 20, 'modules': ['all'],
    }
    d.update(kw)
    return d


def main():
    # 测试内不依赖厂商私钥：只验证“字段/机器码/到期”判定逻辑
    orig = license_key._verify_rsa
    license_key._verify_rsa = lambda p, s: True
    try:
        d1 = tempfile.mkdtemp(prefix='lic_trial_')
        st = license_key.load_status(d1, allow_trial=True)
        check('源码/测试模式无文件时生成 30 天试用', st['state'] == 'trial' and st['trial'], st['state'])

        d2 = tempfile.mkdtemp(prefix='lic_none_')
        st = license_key.load_status(d2, allow_trial=False)
        check('打包模式无授权文件不生成试用', st['state'] == 'invalid', st['state'])
        check('无授权文件提示导入', '未找到授权文件' in (st.get('reason') or ''), st.get('reason'))
        check('无授权文件不写 license.json', not os.path.exists(os.path.join(d2, 'license.json')))

        d3 = tempfile.mkdtemp(prefix='lic_uni_')
        rec = payload()
        rec['sig'] = 'x'
        write_license(d3, rec)
        st = license_key.load_status(d3)
        check('通用授权 machine=* 通过机器码校验', st['state'] == 'valid', st['state'] + ' ' + st.get('reason', ''))
        check('通用授权保留单位/版本/用户数', st['org'] == '东华大学' and st['edition'] == '标准版' and st['max_users'] == 20)
        check('通用授权非试用', st['trial'] is False)
        check('通用授权可写', license_key.can_write(st))

        d4 = tempfile.mkdtemp(prefix='lic_bad_')
        rec = payload(machine='AAAA-BBBB-CCCC-DDDD')
        rec['sig'] = 'x'
        write_license(d4, rec)
        st = license_key.load_status(d4)
        check('绑定其他机器码的授权仍拒绝', st['state'] == 'invalid', st['state'])
        check('机器码不匹配提示', '机器码不匹配' in (st.get('reason') or ''), st.get('reason'))

        d5 = tempfile.mkdtemp(prefix='lic_exp_')
        old = (datetime.date.today() - datetime.timedelta(days=30)).isoformat()
        rec = payload(expires=old)
        rec['sig'] = 'x'
        write_license(d5, rec)
        st = license_key.load_status(d5)
        check('过期通用授权进入锁定/宽限', st['state'] in ('grace', 'expired'), st['state'])

        d6 = tempfile.mkdtemp(prefix='lic_imp_')
        text = json.dumps(payload(machine='*'), ensure_ascii=False)
        rec = json.loads(text)
        rec['sig'] = 'x'
        ok, res = license_key.import_license(d6, json.dumps(rec, ensure_ascii=False))
        check('可导入签名有效的通用授权', ok, res if not ok else '')
        if ok:
            check('导入后状态 valid', res['state'] == 'valid')
    finally:
        license_key._verify_rsa = orig

    print('\n%d/%d passed' % (sum(results), len(results)))
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
