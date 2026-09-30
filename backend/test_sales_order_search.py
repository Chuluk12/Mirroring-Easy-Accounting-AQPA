"""Regression checks without starting the server or background services."""
import ast
from pathlib import Path
import re
import unittest


def load_helpers():
    source = Path(__file__).with_name('server.py')
    tree = ast.parse(source.read_text(encoding='utf-8-sig'))
    names = {'_so_where_clause', '_so_shipping_address', '_build_so_rows', '_so_net_dpp_amount'}
    namespace = {'re': re}
    nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source), 'exec'), namespace)
    return namespace


class SalesOrderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.helpers = load_helpers()

    def test_long_so_search_has_explicit_parameter_width(self):
        sql, params = self.helpers['_so_where_clause'](' AI-PP-262551 ', '2026-09-01', '2026-09-30', '')
        self.assertIn('CAST(? AS VARCHAR(255))', sql)
        self.assertEqual(params[:6], ['AI-PP-262551'] * 6)
        self.assertEqual(sql.count('?'), len(params))
        self.assertEqual(params[-2:], ['2026-09-01', '2026-09-30'])

    def test_non_gte_category_search(self):
        _, params = self.helpers['_so_where_clause']('NON GTE', '', '', '')
        self.assertEqual(params[-1], 'non gte')

    def test_shipping_address_excludes_phone_preserves_street_numbers(self):
        address = self.helpers['_so_shipping_address']([
            'PAMAPERSADA NUSANTARA', 'WAREHOUSE PAMA\nJL. RAYA NAROGONG KM.23.8',
            '021-8249-1313', 'BOGOR 16820', 'Telp: +62 812 3456 7890',
        ])
        self.assertEqual(address, 'PAMAPERSADA NUSANTARA\nWAREHOUSE PAMA\nJL. RAYA NAROGONG KM.23.8\nBOGOR 16820')

    def test_row_mapping_includes_all_address_fields(self):
        row = [None] * 34
        row[15] = 'CUSTOMER'
        row[30:34] = ['STREET 23', '021-8249-1313', 'BOGOR', '16820']
        result = self.helpers['_build_so_rows']([row])[0]
        self.assertEqual(result['shipto'], 'CUSTOMER\nSTREET 23\nBOGOR\n16820')


if __name__ == '__main__':
    unittest.main()
